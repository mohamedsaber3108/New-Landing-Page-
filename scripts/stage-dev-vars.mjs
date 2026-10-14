// Stages local secrets into the wrangler config directory before `npm start`.
//
// WHY: production runs `wrangler dev --local` (Miniflare). Miniflare does NOT
// inherit the host/systemd process environment, and it reads a `.dev.vars` file
// located NEXT TO the --config file (here: dist/server/.dev.vars). But dist/ is
// rebuilt on every deploy (`rm -rf dist`), so a secret written there by hand is
// wiped. This script re-creates dist/server/.dev.vars at launch by copying from
// a STABLE source that lives OUTSIDE dist/ and outside Git.
//
// Source precedence (first that exists wins):
//   1. $USAM_DEV_VARS_FILE                (explicit override)
//   2. ~/.usam/dev.vars                    (recommended on the server)
//   3. <repo>/.dev.vars                    (local development; gitignored)
//
// The file is plain `KEY=VALUE` lines (e.g. USAM_ADMIN_TOKEN=...,
// USAM_LEAD_NOTIFY_WEBHOOK=...). It is NEVER committed (.gitignore covers
// .dev.vars) and its contents are never printed by this script.
//
// If no source file exists, this is a NO-OP (admin endpoints then stay
// fail-closed 403) — staging secrets is a deliberate action, not automatic.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const dest = path.join(repoRoot, "dist", "server", ".dev.vars");

const candidates = [
  process.env.USAM_DEV_VARS_FILE,
  path.join(homedir(), ".usam", "dev.vars"),
  path.join(repoRoot, ".dev.vars"),
].filter(Boolean);

const source = candidates.find((p) => existsSync(p));

if (!source) {
  console.log(
    "[stage-dev-vars] No secrets file found (checked ~/.usam/dev.vars and ./.dev.vars). " +
      "Admin endpoints will stay fail-closed (403) until one is provided.",
  );
  process.exit(0);
}

if (!existsSync(path.dirname(dest))) {
  // dist/server should exist after a build; create defensively if not.
  mkdirSync(path.dirname(dest), { recursive: true });
}

copyFileSync(source, dest);
// Report only the SOURCE path and key NAMES — never values.
console.log(`[stage-dev-vars] Staged secrets from ${source} -> dist/server/.dev.vars`);
