// Daily signed export of the admin audit log (L-A2; owner default taken,
// order 011 B: a file on the app server, kept 1 year; the off-box copy waits
// for the owner). Read-only on the DB. Run on the server from the repo root:
//
//   node scripts/audit-export.mjs --out <folder> [--day YYYY-MM-DD] [--db <file>] [--vars <file>]
//
// --out is required (the server path is the owner's choice). --day defaults to
// yesterday (UTC). Writes <out>/usam-audit-<day>.jsonl: one JSON row per line
// (all admin_audit columns; rows hold no personal text by design), then a last
// line {"type":"signature", day, rows, firstId, lastId, firstPrevHash, lastHash,
// sha256, hmac}, where hmac = HMAC-SHA256(key, "usam-audit-export:" + sha256 of
// the row lines). An existing file is never overwritten. Check a file with
// `node scripts/audit-verify.mjs --file <file>`.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { arg, dbPath, openDb, readKey, sha256Hex, signExport } from "./audit-chain.mjs";

const COLUMNS = ["id", "ts", "actor_type", "actor_id", "role", "action", "target_type", "target_id", "before_json", "after_json", "reason", "result", "ip_hash", "request_id", "prev_hash", "hash"];

/** Build the file text for `rows` (already the rows of `day`, in id order). */
export function buildExport(key, day, rows) {
  const lines = rows.map((r) => JSON.stringify(Object.fromEntries(COLUMNS.map((c) => [c, r[c] ?? null]))));
  const body = lines.length ? `${lines.join("\n")}\n` : "";
  const digest = sha256Hex(body);
  const sig = {
    type: "signature",
    day,
    rows: rows.length,
    firstId: rows[0]?.id ?? null,
    lastId: rows.at(-1)?.id ?? null,
    firstPrevHash: rows[0]?.prev_hash ?? null,
    lastHash: rows.at(-1)?.hash ?? null,
    sha256: digest,
    hmac: signExport(key, digest),
  };
  return `${body}${JSON.stringify(sig)}\n`;
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
  let rows;
  try {
    rows = db.prepare("SELECT * FROM admin_audit WHERE ts >= ? AND ts <= ? ORDER BY id").all(`${day}T00:00:00.000Z`, `${day}T23:59:59.999Z`);
  } finally {
    db.close();
  }
  mkdirSync(out, { recursive: true, mode: 0o750 });
  const file = join(out, `usam-audit-${day}.jsonl`);
  writeFileSync(file, buildExport(key, day, rows), { flag: "wx", mode: 0o640 }); // wx: never overwrite
  console.log(`audit-export: wrote ${rows.length} rows to ${file}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`audit-export: ${error.message}`);
    process.exit(1);
  });
}
