// Admin audit log (L-A2, ADMIN.md s.7; Engineering judge rulings).
//
//  - Append-only hash chain in D1 (table admin_audit):
//      hash = HMAC-SHA256(USAM_AUDIT_HMAC_KEY, prev_hash + "\n" + canonical row)
//    The first row follows GENESIS_HASH. scripts/audit-verify.mjs walks it.
//  - No fork: prev_hash has a UNIQUE index. An append reads the last row,
//    computes its hash and inserts with ON CONFLICT DO NOTHING; if another
//    append took that prev_hash first, nothing is written and it retries on
//    the new last row. Appends in one process also queue behind each other.
//  - Sensitive actions (STEP_UP_PERMISSIONS, backup-code regeneration) write
//    their entry BEFORE acting, with `required: true`: if the write fails (no
//    key, DB error) the action is refused. Other entries (reads, denied tries)
//    are best effort: a failed write is reported in the server log and the
//    request goes on. Without the key nothing is written and reads still work.
//  - No personal text: actors are staff ids; every value is scrubbed of
//    e-mail addresses and phone numbers before it is stored.

import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAudit, type AdminAuditRow, type StaffUser } from "@/db/schema";
import type { Db } from "./idempotency";
import { clientIp } from "./rate-limit";
import { PERMISSIONS } from "./staff-permissions";
import { keyedIpHash } from "./staff-session";

export const GENESIS_HASH = "0".repeat(64);
export const MIN_AUDIT_KEY_LENGTH = 32;
const MAX_ATTEMPTS = 5;

export const AUTH_ACTIONS = [
  "auth:login",
  "auth:login-mfa",
  "auth:logout",
  "auth:mfa-setup",
  "auth:mfa-verify",
  "auth:mfa-step-up",
  "auth:mfa-backup-codes",
] as const;
/** Written by server command-line tools (actor_type "server_cli"), e.g. scripts/create-staff.mjs. */
export const CLI_ACTIONS = ["staff:create"] as const;
/** The fixed action list: every admin permission, the sign-in events and the CLI events. */
export const AUDIT_ACTIONS = [...PERMISSIONS, ...AUTH_ACTIONS, ...CLI_ACTIONS] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const AUDIT_RESULTS = ["success", "denied", "failed"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export type AuditActor =
  | { type: "staff"; id: number; role: string }
  | { type: "break_glass" }
  | { type: "anonymous"; id?: number | null };

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  result: AuditResult;
  requestId?: string | null;
  targetType?: string | null;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

export class AuditUnavailable extends Error {
  constructor(why: "key" | "write") {
    super(
      why === "key"
        ? `Audit log is not available: USAM_AUDIT_HMAC_KEY is not set (${MIN_AUDIT_KEY_LENGTH}+ characters). Sensitive actions are refused until it is.`
        : "Audit log write failed, so this sensitive action was not done. Try again later.",
    );
  }
}

const db = () => getDb() as unknown as Db;
const enc = new TextEncoder();

function auditKey(): string | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const key = env.USAM_AUDIT_HMAC_KEY;
  return key && key.length >= MIN_AUDIT_KEY_LENGTH ? key : null;
}

export function auditConfigured(): boolean {
  return auditKey() !== null;
}

export const staffActor = (user: Pick<StaffUser, "id" | "role">): AuditActor => ({ type: "staff", id: user.id, role: user.role });

// ---- scrubbing (no personal text in the log) -------------------------------

const EMAIL = /[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]+/g;
// 7+ digits, allowing spaces, dots, dashes, brackets and a leading +.
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;
const MAX_TEXT = 200;

/** Replace e-mails and phone numbers, cap length. Exported for tests. */
export function scrubText(text: string): string {
  const clean = text
    .replace(EMAIL, "[email]")
    // 8+ digits looks like a phone number; an ISO date (2026-06-01...) does not count.
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 8 && !/^\d{4}-\d{2}-\d{2}/.test(m) ? "[number]" : m));
  // Cut on code points, never inside a UTF-16 surrogate pair (review-022 B5):
  // a lone half would be stored differently and break the chain check.
  return Array.from(clean).slice(0, MAX_TEXT).join("");
}

function scrub(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) < 1e6 ? value : "[number]";
  if (typeof value === "string") return scrubText(value);
  if (depth > 3) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) out[scrubText(k)] = scrub(v, depth + 1);
    return out;
  }
  return null;
}

const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(scrub(v)));

// ---- chain ------------------------------------------------------------------

type ChainFields = Omit<AdminAuditRow, "id" | "prevHash" | "hash">;

/** Same field order as scripts/audit-chain.mjs (test/audit.test.ts checks both agree). */
export function canonical(row: ChainFields): string {
  return JSON.stringify([
    row.ts, row.actorType, row.actorId, row.role, row.action, row.targetType, row.targetId,
    row.beforeJson, row.afterJson, row.reason, row.result, row.ipHash, row.requestId,
  ]);
}

async function chainHash(key: string, prevHash: string, row: ChainFields): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(`${prevHash}\n${canonical(row)}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * One try. `ts` is taken HERE, inside the queue and after reading the last
 * row, and never earlier than that row's ts (review-022 B1): so id order and
 * ts order always agree and a day's export is one unbroken piece of the chain,
 * even around midnight or with another writer (isolate, create-staff.mjs).
 */
async function appendOnce(key: string, entry: Omit<ChainFields, "ts">): Promise<boolean> {
  const last = await db().select({ hash: adminAudit.hash, ts: adminAudit.ts }).from(adminAudit).orderBy(desc(adminAudit.id)).limit(1);
  const prevHash = last[0]?.hash ?? GENESIS_HASH;
  const now = new Date().toISOString();
  const fields: ChainFields = { ...entry, ts: last[0] && last[0].ts > now ? last[0].ts : now };
  const hash = await chainHash(key, prevHash, fields);
  const inserted = await db().insert(adminAudit).values({ ...fields, prevHash, hash }).onConflictDoNothing().returning({ id: adminAudit.id });
  return inserted.length === 1;
}

/**
 * Append one entry. With `required` (sensitive actions) it throws
 * AuditUnavailable on any failure; otherwise a failure is only logged.
 */
export async function appendAudit(request: Request | null, entry: AuditEntry, opts: { required?: boolean } = {}): Promise<void> {
  const key = auditKey();
  if (!key) {
    if (opts.required) throw new AuditUnavailable("key");
    return;
  }
  const actor = entry.actor;
  const fields: Omit<ChainFields, "ts"> = {
    actorType: actor.type,
    actorId: actor.type === "staff" ? actor.id : actor.type === "anonymous" ? (actor.id ?? null) : null,
    role: actor.type === "staff" ? actor.role : null,
    action: entry.action,
    targetType: entry.targetType ? scrubText(entry.targetType) : null,
    targetId: entry.targetId == null ? null : scrubText(String(entry.targetId)),
    beforeJson: json(entry.before),
    afterJson: json(entry.after),
    reason: entry.reason ? scrubText(entry.reason) : null,
    result: entry.result,
    ipHash: request ? await keyedIpHash(clientIp(request)) : null,
    requestId: entry.requestId ?? null,
  };
  const run = async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) if (await appendOnce(key, fields)) return;
    throw new Error("audit chain busy");
  };
  const job = queue.then(run, run);
  queue = job.catch(() => undefined);
  try {
    await job;
  } catch {
    if (opts.required) throw new AuditUnavailable("write");
    console.warn(`[audit] write failed for action ${entry.action}`); // no entry data in the server log
  }
}

// ---- read -------------------------------------------------------------------

export type AuditFilters = { from?: string; to?: string; action?: string; result?: string; cursor?: number; limit: number };

/** Newest first. `from`/`to` are YYYY-MM-DD (UTC, inclusive). */
export async function listAudit(f: AuditFilters): Promise<{ rows: AdminAuditRow[]; nextCursor: number | null }> {
  const conditions = [];
  if (f.from) conditions.push(gte(adminAudit.ts, `${f.from}T00:00:00.000Z`));
  if (f.to) conditions.push(lte(adminAudit.ts, `${f.to}T23:59:59.999Z`));
  if (f.action) conditions.push(eq(adminAudit.action, f.action));
  if (f.result) conditions.push(eq(adminAudit.result, f.result));
  if (f.cursor) conditions.push(lt(adminAudit.id, f.cursor));
  const base = db().select().from(adminAudit);
  const filtered = conditions.length ? base.where(and(...conditions)) : base;
  const rows = (await filtered.orderBy(desc(adminAudit.id)).limit(f.limit + 1)) as AdminAuditRow[];
  const more = rows.length > f.limit;
  const page = more ? rows.slice(0, f.limit) : rows;
  return { rows: page, nextCursor: more ? page[page.length - 1].id : null };
}
