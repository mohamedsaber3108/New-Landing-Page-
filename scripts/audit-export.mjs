// Daily signed export of the admin audit log (L-A2; owner default taken,
// order 011 B: a file on the app server, kept 1 year; the off-box copy waits
// for the owner). Read-only on the DB. Run on the server from the repo root:
//
//   node scripts/audit-export.mjs --out <folder> [--day YYYY-MM-DD] [--db <file>] [--vars <file>]
//
// --out is required (the server path is the owner's choice). --day defaults to
// yesterday (UTC). Writes <out>/usam-audit-<day>.jsonl (format version 2):
//   line 1: {"type":"header", version, day, rows, firstId, lastId,
//            firstPrevHash, lastHash, headId, headHash, totalRows}
//           head* = the chain head at the end of that day and the number of
//           rows up to it: the anchor audit-verify.mjs checks the DB against
//           (catches a cut-off tail or a wiped table).
//   then:   one JSON row per line (all admin_audit columns; no personal text)
//   last:   {"type":"signature", sha256, hmac}: sha256 of the header line AND
//           the rows, hmac = HMAC-SHA256(key, "usam-audit-export:" + sha256).
// Rows are those with ts in the day; ts never goes back in id order (lib/api/
// audit.ts), so they are one unbroken piece of the chain. An existing file is
// never overwritten. Check a file with `node scripts/audit-verify.mjs --file <file>`.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { arg, dbPath, openDb, readKey, sha256Hex, signExport } from "./audit-chain.mjs";

const COLUMNS = ["id", "ts", "actor_type", "actor_id", "role", "action", "target_type", "target_id", "before_json", "after_json", "reason", "result", "ip_hash", "request_id", "prev_hash", "hash"];

/**
 * Build the file text. `rows` = the rows of `day` in id order; `head` = the
 * last row with ts up to the end of `day` ({ id, hash }, or null) and `totalRows`
 * = rows with id up to head.id.
 * @param {string} key
 * @param {string} day
 * @param {Array<Record<string, any>>} rows
 * @param {{ id: any, hash: any } | null} [head]
 * @param {number} [totalRows]
 */
export function buildExport(key, day, rows, head = null, totalRows = 0) {
  const header = {
    type: "header",
    version: 2,
    day,
    rows: rows.length,
    firstId: rows[0]?.id ?? null,
    lastId: rows.at(-1)?.id ?? null,
    firstPrevHash: rows[0]?.prev_hash ?? null,
    lastHash: rows.at(-1)?.hash ?? null,
    headId: head?.id ?? null,
    headHash: head?.hash ?? null,
    totalRows: head ? totalRows : 0,
  };
  const lines = [JSON.stringify(header), ...rows.map((r) => JSON.stringify(Object.fromEntries(COLUMNS.map((c) => [c, r[c] ?? null]))))];
  const signed = `${lines.join("\n")}\n`;
  const digest = sha256Hex(signed);
  return `${signed}${JSON.stringify({ type: "signature", sha256: digest, hmac: signExport(key, digest) })}\n`;
}

function yesterdayUtc() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  const out = arg("out");
  if (!out) throw new Error("--out <folder> is required.");
  const day = arg("day") ?? yesterdayUtc();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("--day must be YYYY-MM-DD.");
  const key = readKey(arg("vars"));
  const db = await openDb(dbPath(arg("db")));
  let rows, head, total;
  const end = `${day}T23:59:59.999Z`;
  try {
    rows = db.prepare("SELECT * FROM admin_audit WHERE ts >= ? AND ts <= ? ORDER BY id").all(`${day}T00:00:00.000Z`, end);
    head = db.prepare("SELECT id, hash FROM admin_audit WHERE ts <= ? ORDER BY id DESC LIMIT 1").get(end) ?? null;
    total = head ? db.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE id <= ?").get(head.id).n : 0;
  } finally {
    db.close();
  }
  mkdirSync(out, { recursive: true, mode: 0o750 });
  const file = join(out, `usam-audit-${day}.jsonl`);
  writeFileSync(file, buildExport(key, day, rows, head, total), { flag: "wx", mode: 0o640 }); // wx: never overwrite
  console.log(`audit-export: wrote ${rows.length} rows to ${file}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`audit-export: ${error.message}`);
    process.exit(1);
  });
}
