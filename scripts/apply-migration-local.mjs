// One-off local helper: apply a drizzle migration SQL file to the local
// Miniflare D1 sqlite used by `npm run dev` / `npm start`. For LOCAL
// verification only — production migrations are applied on the server.
//
// Usage: node scripts/apply-migration-local.mjs drizzle/0004_serious_chamber.sql

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationArg = process.argv[2];
if (!migrationArg) {
  console.error("Usage: node scripts/apply-migration-local.mjs <path-to-.sql>");
  process.exit(1);
}

const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const files = readdirSync(d1Dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
if (files.length === 0) {
  console.error(`No D1 sqlite found in ${d1Dir}. Start the dev server once to create it.`);
  process.exit(1);
}
const dbPath = join(d1Dir, files[0]);
console.log("Applying to:", dbPath);

const sql = readFileSync(migrationArg, "utf8");
// Drizzle separates statements with the --> statement-breakpoint marker.
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const db = new DatabaseSync(dbPath);
let applied = 0;
for (const stmt of statements) {
  try {
    db.exec(stmt);
    applied++;
  } catch (e) {
    // Ignore "already exists" so re-running is safe (idempotent for local use).
    if (/already exists/i.test(String(e.message))) {
      console.log("skip (exists):", stmt.split("\n")[0]);
    } else {
      console.error("FAILED:", stmt.split("\n")[0], "\n ", e.message);
      process.exit(1);
    }
  }
}
db.close();
console.log(`Done. Applied ${applied}/${statements.length} statements.`);
