// Verify the admin audit hash chain (L-A2). Read-only. Run on the server
// from the repo root:
//
//   node scripts/audit-verify.mjs                 # the local D1 file
//   node scripts/audit-verify.mjs --db <file>     # another sqlite copy
//   node scripts/audit-verify.mjs --file <export.jsonl>   # one daily export
//
// Key: env USAM_AUDIT_HMAC_KEY or the KEY=VALUE file in --vars (default
// ~/.usam/dev.vars). Exit 0 = chain intact; exit 1 = the first broken row is
// printed (id and what is wrong); exit 2 = could not run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { arg, dbPath, openDb, readKey, sha256Hex, signExport, verifyRows } from "./audit-chain.mjs";

/** Check one export file: its signature, then the chain inside it. */
export function verifyExportFile(key, text) {
  const lines = text.trimEnd().split("\n");
  const sig = JSON.parse(lines.pop() ?? "{}");
  if (sig.type !== "signature") return { ok: false, problem: "last line is not a signature" };
  const body = lines.length ? `${lines.join("\n")}\n` : "";
  if (sha256Hex(body) !== sig.sha256 || signExport(key, sig.sha256) !== sig.hmac) return { ok: false, problem: "signature does not match the file (file changed)" };
  const rows = lines.map((l) => JSON.parse(l));
  if (rows.length !== sig.rows) return { ok: false, problem: "row count does not match the signature" };
  return rows.length ? verifyRows(key, rows, rows[0].prev_hash) : { ok: true, rows: 0 };
}

async function main() {
  const key = readKey(arg("vars"));
  let result;
  if (arg("file")) {
    result = verifyExportFile(key, readFileSync(arg("file"), "utf8"));
  } else {
    const db = await openDb(dbPath(arg("db")));
    try {
      result = verifyRows(key, db.prepare("SELECT * FROM admin_audit ORDER BY id").all());
    } finally {
      db.close();
    }
  }
  if (result.ok) {
    console.log(`audit-verify: OK, ${result.rows} rows, chain intact.`);
    return 0;
  }
  console.log(`audit-verify: BROKEN${result.brokenId ? ` at row id ${result.brokenId}` : ""}: ${result.problem}.`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`audit-verify: ${error.message}`);
      process.exit(2);
    },
  );
}
