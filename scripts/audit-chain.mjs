// Shared by scripts/audit-verify.mjs and scripts/audit-export.mjs (L-A2).
// The chain rule is the same as lib/api/audit.ts (test/audit.test.ts checks
// that rows written by the app verify here):
//   hash = HMAC-SHA256(key, prev_hash + "\n" + canonical(row)), first prev = 64 zeros.

import { createHash, createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const GENESIS_HASH = "0".repeat(64);
export const MIN_AUDIT_KEY_LENGTH = 32;

/** Row in DB column names (snake_case), as node:sqlite returns it. */
export function canonical(r) {
  return JSON.stringify([
    r.ts, r.actor_type, r.actor_id ?? null, r.role ?? null, r.action, r.target_type ?? null, r.target_id ?? null,
    r.before_json ?? null, r.after_json ?? null, r.reason ?? null, r.result, r.ip_hash ?? null, r.request_id ?? null,
  ]);
}

export function rowHash(key, prevHash, row) {
  return createHmac("sha256", key).update(`${prevHash}\n${canonical(row)}`).digest("hex");
}

/**
 * Walk rows in id order. Returns { ok: true, rows } or
 * { ok: false, rows, brokenId, problem } for the FIRST broken row.
 * `startPrev` lets an export file of one day be checked on its own.
 */
export function verifyRows(key, rows, startPrev = GENESIS_HASH) {
  let prev = startPrev;
  for (const row of rows) {
    if (row.prev_hash !== prev) return { ok: false, rows: rows.length, brokenId: row.id, problem: "prev_hash does not match the row before (row missing, moved or inserted)" };
    if (rowHash(key, prev, row) !== row.hash) return { ok: false, rows: rows.length, brokenId: row.id, problem: "hash does not match the row content (row changed)" };
    prev = row.hash;
  }
  return { ok: true, rows: rows.length, lastHash: prev };
}

/**
 * Anchor check (review-022 B4): the chain head recorded in a signed export
 * (headId, headHash, totalRows) must still be in the DB. Catches a cut-off
 * tail or a wiped table, which a chain walk alone cannot see. `rows` are all
 * DB rows in id order. Rows written after that export cannot be checked this
 * way: the anchor is as fresh as the latest export (daily).
 */
export function checkAnchor(rows, header) {
  if (!header.headId) return { ok: true, rows: rows.length };
  const head = rows.find((r) => r.id === header.headId);
  if (!head) return { ok: false, rows: rows.length, brokenId: header.headId, problem: `anchor row is missing: the log was cut or wiped (export ${header.day} saw ${header.totalRows} rows up to id ${header.headId})` };
  if (head.hash !== header.headHash) return { ok: false, rows: rows.length, brokenId: header.headId, problem: "anchor row hash differs from the signed export (row changed or chain rebuilt)" };
  const upTo = rows.filter((r) => r.id <= header.headId).length;
  if (upTo !== header.totalRows) return { ok: false, rows: rows.length, brokenId: header.headId, problem: `${header.totalRows} rows up to id ${header.headId} in the export, ${upTo} now` };
  return { ok: true, rows: rows.length };
}

/**
 * Append one row from a server CLI tool (node:sqlite `db`), in the caller's
 * transaction. Same rules as lib/api/audit.ts: ts never earlier than the last
 * row's ts, prev_hash = last hash (UNIQUE index stops a fork).
 */
export function appendRowSync(db, key, entry) {
  const last = db.prepare("SELECT hash, ts FROM admin_audit ORDER BY id DESC LIMIT 1").get();
  const now = new Date().toISOString();
  const row = {
    ts: last && last.ts > now ? last.ts : now,
    actor_type: entry.actor_type, actor_id: entry.actor_id ?? null, role: entry.role ?? null, action: entry.action,
    target_type: entry.target_type ?? null, target_id: entry.target_id == null ? null : String(entry.target_id),
    before_json: entry.before_json ?? null, after_json: entry.after_json ?? null, reason: entry.reason ?? null,
    result: entry.result, ip_hash: null, request_id: null,
  };
  const prev = last?.hash ?? GENESIS_HASH;
  const hash = rowHash(key, prev, row);
  db.prepare(
    "INSERT INTO admin_audit (ts, actor_type, actor_id, role, action, target_type, target_id, before_json, after_json, reason, result, ip_hash, request_id, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(row.ts, row.actor_type, row.actor_id, row.role, row.action, row.target_type, row.target_id, row.before_json, row.after_json, row.reason, row.result, row.ip_hash, row.request_id, prev, hash);
  return hash;
}

export const sha256Hex = (text) => createHash("sha256").update(text).digest("hex");
export const signExport = (key, digest) => createHmac("sha256", key).update(`usam-audit-export:${digest}`).digest("hex");

export function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/**
 * The key from env USAM_AUDIT_HMAC_KEY, else from a KEY=VALUE file (--vars,
 * default ~/.usam/dev.vars), so it never has to be typed on a command line.
 */
export function readKey(varsPath) {
  let key = process.env.USAM_AUDIT_HMAC_KEY;
  const file = varsPath ?? join(homedir(), ".usam", "dev.vars");
  if (!key && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*USAM_AUDIT_HMAC_KEY\s*=\s*(.*)\s*$/.exec(line);
      if (m) key = m[1].replace(/^["']|["']$/g, "");
    }
  }
  if (!key || key.length < MIN_AUDIT_KEY_LENGTH) throw new Error(`USAM_AUDIT_HMAC_KEY is not set (${MIN_AUDIT_KEY_LENGTH}+ characters).`);
  return key;
}

/** The local D1 sqlite file (same lookup as scripts/create-staff.mjs), or --db. */
export function dbPath(explicit) {
  if (explicit) return explicit;
  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (files.length !== 1) throw new Error(`Expected one D1 sqlite file in ${dir}, found ${files.length}. Pass --db <file>.`);
  return join(dir, files[0]);
}

export async function openDb(path) {
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(path, { readOnly: true });
}

/** Newest export file in a folder (names sort by day), or null. */
export function latestExport(dir) {
  const files = readdirSync(dir).filter((f) => /^usam-audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  return files.length ? join(dir, files.at(-1)) : null;
}
