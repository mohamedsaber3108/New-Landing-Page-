// CI helper for the e2e job: apply every drizzle migration, in order, to the
// LOCAL D1 that `npm start` uses (.wrangler/state). Run from the repo root
// after `npm run build` (it needs dist/server/wrangler.json).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(path.join(root, "drizzle"))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();
if (files.length === 0) throw new Error("no drizzle/*.sql migrations found");

for (const file of files) {
  console.log(`[e2e-migrate] ${file}`);
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/wrangler/bin/wrangler.js"),
      "d1", "execute", "DB", "--local",
      "--persist-to", path.join(root, ".wrangler/state"),
      "--config", path.join(root, "dist/server/wrangler.json"),
      "--file", path.join(root, "drizzle", file),
    ],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  if (result.status !== 0) {
    console.error(`[e2e-migrate] FAILED on ${file}`);
    process.exit(result.status ?? 1);
  }
}
console.log(`[e2e-migrate] applied ${files.length} migration(s)`);
