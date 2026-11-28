// Verify the admin audit hash chain (L-A2). Read-only. Run on the server
// from the repo root:
//
//   node scripts/audit-verify.mjs --anchor-dir <export folder>   # daily job (recommended)
//   node scripts/audit-verify.mjs                 # the local D1 file, chain only
//   node scripts/audit-verify.mjs --db <file>     # another sqlite copy
//   node scripts/audit-verify.mjs --anchor <export.jsonl>        # anchor = that file
//   node scripts/audit-verify.mjs --file <export.jsonl>          # one export file only
//
// The chain walk finds a changed, removed or inserted row. It cannot see rows
// cut off the END or a wiped table (review-022 B4), so with --anchor-dir the
// newest signed export is checked first and its chain head (headId, headHash,
// totalRows) must still be in the DB. Rows newer than that export are covered
// by the next day's export.
//
// Key: env USAM_AUDIT_HMAC_KEY or the KEY=VALUE file in --vars (default
// ~/.usam/dev.vars). Exit 0 = intact; exit 1 = the first problem is printed
// (row id and what is wrong); exit 2 = could not run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { arg, checkAnchor, dbPath, latestExport, openDb, readKey, sha256Hex, signExport, verifyRows } from "./audit-chain.mjs";

/** Parse and check one export file (format version 2). Returns { ok, header, ... }. */
export function verifyExportFile(key, text) {
  const lines = text.trimEnd().split("\n");
  let sig, header;
  try {
    sig = JSON.parse(lines.pop() ?? "{}");
    header = JSON.parse(lines[0] ?? "{}");
  } catch {
    return { ok: false, problem: "file is not valid JSON lines" };
  }
  if (sig.type !== "signature" || header.type !== "header" || header.version !== 2) return { ok: false, problem: "missing header or signature line (not a version 2 export)" };
  const digest = sha256Hex(`${lines.join("\n")}\n`);
  if (digest !== sig.sha256 || signExport(key, digest) !== sig.hmac) return { ok: false, problem: "signature does not match the file (header or rows changed)" };
  const rows = lines.slice(1).map((l) => JSON.parse(l));
  const facts = [rows.length, rows[0]?.id ?? null, rows.at(-1)?.id ?? null, rows[0]?.prev_hash ?? null, rows.at(-1)?.hash ?? null];
  if (JSON.stringify(facts) !== JSON.stringify([header.rows, header.firstId, header.lastId, header.firstPrevHash, header.lastHash])) {
    return { ok: false, header, problem: "header does not match the rows" };
  }
  const chain = rows.length ? verifyRows(key, rows, rows[0].prev_hash) : { ok: true, rows: 0 };
  return { ...chain, header };
}

/** Chain walk, then (with a header) the anchor check. */
export function verifyDb(key, rows, header = null) {
  const chain = verifyRows(key, rows);
  if (!chain.ok || !header) return chain;
  return checkAnchor(rows, header);
}

async function main() {
  const key = readKey(arg("vars"));
  let result;
  if (arg("file")) {
    result = verifyExportFile(key, readFileSync(arg("file"), "utf8"));
  } else {
    let header = null;
    const anchorFile = arg("anchor") ?? (arg("anchor-dir") ? latestExport(arg("anchor-dir")) : null);
    if (arg("anchor-dir") && !anchorFile) throw new Error(`no usam-audit-*.jsonl in ${arg("anchor-dir")}`);
    if (anchorFile) {
      const file = verifyExportFile(key, readFileSync(anchorFile, "utf8"));
      if (!file.ok) {
        console.log(`audit-verify: BROKEN anchor file ${anchorFile}: ${file.problem}.`);
        return 1;
      }
      header = file.header;
    }
    const db = await openDb(dbPath(arg("db")));
    try {
      result = verifyDb(key, db.prepare("SELECT * FROM admin_audit ORDER BY id").all(), header);
    } finally {
      db.close();
    }
    if (!anchorFile) console.log("audit-verify: note: no --anchor-dir, so a cut-off tail or a wiped table is not checked.");
    else if (result.ok) console.log(`audit-verify: anchor ${header.day} (row ${header.headId}, ${header.totalRows} rows) found.`);
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
