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
