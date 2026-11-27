// L-A2: admin audit log — append, chain verify, tamper detected, parallel
// appends keep one chain, denied tries logged, sensitive action fails when the
// audit write fails, no e-mail or phone in any row, GET /api/v1/admin/audit.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  lte: (col: unknown, value: unknown) => ({ kind: "lte", col, value }),
  gte: (col: unknown, value: unknown) => ({ kind: "gte", col, value }),
  isNull: (col: unknown) => ({ kind: "isNull", col }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));
const store = new FakeStore();
vi.mock("@/db", () => ({ getDb: () => store }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import * as auditRoute from "@/app/api/v1/admin/audit/route";
import { adminAudit } from "@/db/schema";
import * as leadsRoute from "@/app/api/v1/admin/leads/route";
import * as policiesRoute from "@/app/api/v1/admin/policies/route";
import { POST as loginPOST } from "@/app/api/v1/admin/auth/login/route";
import { GENESIS_HASH, appendAudit, canonical as appCanonical, scrubText } from "@/lib/api/audit";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { hashPassphrase } from "@/lib/api/staff-password";
import { SESSION_COOKIE } from "@/lib/api/staff-session";
import * as chain from "../scripts/audit-chain.mjs";
import { buildExport } from "../scripts/audit-export.mjs";
import { verifyExportFile } from "../scripts/audit-verify.mjs";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const KEY = "a".repeat(40); // test-only
const TOKEN = "d".repeat(48); // test-only
const ORIGIN = "https://x.test";
const PASS = "correct horse battery staple";
const EMAIL = "agent.private@example.test";

let ipN = 0;
const nextIp = () => `10.93.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}`;
function req(path: string, init: { method?: string; token?: string; cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Real-IP": nextIp(), origin: ORIGIN };
  if (init.token !== undefined) headers["x-admin-token"] = init.token;
  if (init.cookie) headers.cookie = `${SESSION_COOKIE}=${init.cookie}`;
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

type Row = Record<string, unknown>;
const rows = () => store.tables.admin_audit as Row[];
const snake = (r: Row) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));
const verify = (list = rows()) => chain.verifyRows(KEY, list.map(snake));
const publish = (version: string, token = TOKEN) =>
  policiesRoute.POST(req("/api/v1/admin/policies", { method: "POST", token, body: { policyType: "terms", locale: "en", version } }));

beforeEach(async () => {
  store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [], staff_users: [], staff_sessions: [], staff_backup_codes: [], admin_audit: [] };
  resetRateLimits();
  ENV.USAM_AUDIT_HMAC_KEY = KEY;
  ENV.USAM_ADMIN_TOKEN = TOKEN;
  store.tables.staff_users.push({
    id: 1, email: EMAIL, displayName: "Agent", role: "lead_inbox_agent", passwordHash: await hashPassphrase(PASS, 1000),
    createdAt: new Date().toISOString(), disabledAt: null, failedCount: 0, lockedUntil: null, mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: 0,
  });
});
afterEach(() => {
  delete ENV.USAM_AUDIT_HMAC_KEY;
  delete ENV.USAM_ADMIN_TOKEN;
  vi.restoreAllMocks();
});

describe("hash chain", () => {
  it("append: rows link from GENESIS, and the app and the scripts compute the same hashes", async () => {
    for (const action of ["leads:view", "consent:view", "outbox:retry"] as const) {
      await appendAudit(null, { actor: { type: "staff", id: 7, role: "admin" }, action, result: "success", after: { n: 1 } });
    }
    expect(rows()).toHaveLength(3);
    expect(rows()[0].prevHash).toBe(GENESIS_HASH);
    expect(rows()[1].prevHash).toBe(rows()[0].hash);
    for (const r of rows()) expect(chain.canonical(snake(r))).toBe(appCanonical(r as never));
    expect(verify()).toMatchObject({ ok: true, rows: 3 });
  });

  it("tamper: a changed row, a removed row and a wrong key are each found at the first broken row", async () => {
    for (let i = 0; i < 4; i++) await appendAudit(null, { actor: { type: "break_glass" }, action: "leads:view", result: "success" });
    const list = rows().map((r) => ({ ...r }));
    const changed = list.map((r, i) => (i === 1 ? { ...r, result: "denied" } : r));
    expect(verify(changed)).toMatchObject({ ok: false, brokenId: list[1].id });
    const removed = list.filter((_, i) => i !== 2);
    expect(verify(removed)).toMatchObject({ ok: false, brokenId: list[3].id });
    expect(chain.verifyRows("b".repeat(40), list.map(snake))).toMatchObject({ ok: false, brokenId: list[0].id });
  });

  it("parallel appends keep one chain (no two rows share a prev_hash)", async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => appendAudit(null, { actor: { type: "staff", id: i + 1, role: "admin" }, action: "leads:view", result: "success" })));
    expect(rows()).toHaveLength(25);
    expect(new Set(rows().map((r) => r.prevHash)).size).toBe(25);
    expect(verify()).toMatchObject({ ok: true, rows: 25 });
  });

  it("no key: nothing is written for normal entries, and a required entry throws", async () => {
    delete ENV.USAM_AUDIT_HMAC_KEY;
    await appendAudit(null, { actor: { type: "break_glass" }, action: "leads:view", result: "success" });
    expect(rows()).toHaveLength(0);
    await expect(appendAudit(null, { actor: { type: "break_glass" }, action: "policies:publish", result: "success" }, { required: true })).rejects.toThrow(/USAM_AUDIT_HMAC_KEY/);
  });
});

describe("what is logged", () => {
  it("admin reads (success) and denied tries: bad token, no credentials, wrong role, login fail", async () => {
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { token: TOKEN }))).status).toBe(200);
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { token: "wrong" }))).status).toBe(401);
    expect((await leadsRoute.GET(req("/api/v1/admin/leads"))).status).toBe(401);
    const bad = await loginPOST(req("/api/v1/admin/auth/login", { method: "POST", body: { email: EMAIL, passphrase: "wrong passphrase!!" } }));
    expect(bad.status).toBe(401);
    await loginPOST(req("/api/v1/admin/auth/login", { method: "POST", body: { email: "nobody@example.test", passphrase: PASS } }));
    const ok = await loginPOST(req("/api/v1/admin/auth/login", { method: "POST", body: { email: EMAIL, passphrase: PASS } }));
    const cookie = /usam_staff_session=([^;]*)/.exec(ok.headers.get("set-cookie") ?? "")![1];
    expect((await auditRoute.GET(req("/api/v1/admin/audit", { cookie }))).status).toBe(403); // agent: no audit:view

    const summary = rows().map((r) => `${r.action}|${r.result}|${r.actorType}|${r.actorId ?? "-"}|${r.afterJson ?? ""}`);
    expect(summary).toEqual([
      "leads:view|success|break_glass|-|",
      'leads:view|denied|break_glass|-|{"denied":"bad_token"}',
      'leads:view|denied|anonymous|-|{"denied":"no_credentials"}',
      'auth:login|denied|anonymous|1|{"denied":"bad_passphrase"}',
      'auth:login|denied|anonymous|-|{"denied":"unknown_account"}',
      'auth:login|success|staff|1|{"stage":"full"}',
      'audit:view|denied|staff|1|{"denied":"role"}',
    ]);
    expect(rows().every((r) => r.role === null || r.role === "lead_inbox_agent")).toBe(true);
    expect(rows().every((r) => r.requestId === null || /^req_[0-9a-f]{48}$/.test(String(r.requestId)))).toBe(true);
    expect(verify()).toMatchObject({ ok: true });
  });

  it("no e-mail or phone number in any audit row, even when the request carries them", async () => {
    await loginPOST(req("/api/v1/admin/auth/login", { method: "POST", body: { email: EMAIL, passphrase: "wrong passphrase!!" } }));
    await publish("v1 call +20 100 123 4567 or mail someone@example.org");
    await appendAudit(null, { actor: { type: "break_glass" }, action: "leads:view", result: "success", reason: "asked by 01001234567", after: { note: "x@y.test", phone: 201001234567, date: "2026-06-01" } });
    // Hashes and ids are random hex (they may hold digit runs), so they are left out.
    const text = JSON.stringify(rows().map(({ prevHash: _p, hash: _h, ipHash: _i, requestId: _r, ...rest }) => rest));
    expect(rows().length).toBe(3);
    expect(text).not.toMatch(/[^\s@"]+@[^\s@"]+\.[a-z]+/i);
    expect(text).not.toMatch(/\d{7,}/);
    expect(text).not.toContain(EMAIL);
    expect(text).toContain("2026-06-01"); // dates are kept
    expect(scrubText("ring 010 0123 4567")).toBe("ring [number]");
  });
});

describe("sensitive action (policy publish) fails when the audit write fails", () => {
  it("logged before acting; with the entry the publish happens", async () => {
    expect((await publish("v-ok")).status).toBe(201);
    expect(rows().map((r) => `${r.action}|${r.result}|${r.targetId}`)).toEqual(["policies:publish|success|terms:en"]);
    expect(JSON.parse(String(rows()[0].afterJson))).toMatchObject({ version: "v-ok" });
  });

  it("no USAM_AUDIT_HMAC_KEY -> 503 with a clear message, nothing published", async () => {
    delete ENV.USAM_AUDIT_HMAC_KEY;
    const res = await publish("v-nokey");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("USAM_AUDIT_HMAC_KEY");
    expect(store.tables.policy_publications).toHaveLength(0);
    // Reads still work without the key.
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { token: TOKEN }))).status).toBe(200);
  });

  it("audit insert fails (DB error) -> 503, nothing published", async () => {
    const realInsert = store.insert.bind(store);
    vi.spyOn(store, "insert").mockImplementation(((table: unknown) => {
      if (table === adminAudit) throw new Error("disk full");
      return realInsert(table);
    }) as never);
    const res = await publish("v-dberror");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/not done/);
    expect(store.tables.policy_publications).toHaveLength(0);
  });
});

describe("GET /api/v1/admin/audit", () => {
  it("filters by result and action, newest first, paginated with a cursor", async () => {
    for (let i = 0; i < 5; i++) await appendAudit(null, { actor: { type: "break_glass" }, action: "consent:view", result: i % 2 ? "denied" : "success" });
    const page = async (q: string) => (await (await auditRoute.GET(req(`/api/v1/admin/audit${q}`, { token: TOKEN }))).json()) as { data: { entries: Row[] }; meta: { nextCursor?: string } };
    const denied = await page("?result=denied&action=consent:view");
    expect(denied.data.entries.map((e) => e.result)).toEqual(["denied", "denied"]);
    const p1 = await page("?action=consent:view&limit=2");
    expect(p1.data.entries.map((e) => e.id)).toEqual([5, 4].map((n) => (rows()[n - 1].id as number)));
    const p2 = await page(`?action=consent:view&limit=2&cursor=${p1.meta.nextCursor}`);
    expect(p2.data.entries).toHaveLength(2);
    expect(p2.data.entries[0].id as number).toBeLessThan(p1.data.entries[1].id as number);
    const today = new Date().toISOString().slice(0, 10);
    expect((await page(`?from=${today}&to=${today}&action=consent:view`)).data.entries).toHaveLength(5);
    expect((await page("?from=2000-01-01&to=2000-01-02")).data.entries).toHaveLength(0);
    expect((await auditRoute.GET(req("/api/v1/admin/audit?result=maybe", { token: TOKEN }))).status).toBe(422);
  });
});

describe("scripts", () => {
  it("audit-export writes a signed JSONL file that audit-verify accepts; any edit is caught", async () => {
    for (let i = 0; i < 3; i++) await appendAudit(null, { actor: { type: "break_glass" }, action: "leads:view", result: "success" });
    const text = buildExport(KEY, "2026-06-01", rows().map(snake));
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[3])).toMatchObject({ type: "signature", day: "2026-06-01", rows: 3, lastHash: rows()[2].hash });
    expect(verifyExportFile(KEY, text)).toMatchObject({ ok: true, rows: 3 });
    expect(verifyExportFile(KEY, text.replace('"success"', '"denied"'))).toMatchObject({ ok: false });
    expect(verifyExportFile("z".repeat(40), text)).toMatchObject({ ok: false });
    const dir = mkdtempSync(join(tmpdir(), "audit-"));
    writeFileSync(join(dir, "x.jsonl"), text);
    expect(readFileSync(join(dir, "x.jsonl"), "utf8")).not.toMatch(/@/);
  });

  it("readKey refuses a missing or short key", () => {
    delete ENV.USAM_AUDIT_HMAC_KEY;
    expect(() => chain.readKey("/nonexistent/dev.vars")).toThrow(/USAM_AUDIT_HMAC_KEY/);
    ENV.USAM_AUDIT_HMAC_KEY = "short";
    expect(() => chain.readKey("/nonexistent/dev.vars")).toThrow(/32\+/);
  });
});
