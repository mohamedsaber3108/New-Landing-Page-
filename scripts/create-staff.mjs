// Create a staff account in the LOCAL D1 the service uses (L-A1a).
// Run on the server, from the repo root, after migration 0005 is applied:
//
//   node scripts/create-staff.mjs --email owner@example.com --name "Owner" --role super_admin
//
// The passphrase is read from STDIN only (typed twice, not echoed on a
// terminal). It is never taken from argv or the environment, never printed,
// and never written anywhere except as a PBKDF2 hash. There is no default
// account and no seed passphrase. Roles: super_admin | admin | lead_inbox_agent.
//
// The hash format and iteration count match lib/api/staff-password.ts
// (test/staff-auth.test.ts checks that a hash from this file verifies there).

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 14;
const ROLES = ["super_admin", "admin", "lead_inbox_agent"];

export async function hashPassphrase(passphrase, iterations = PBKDF2_ITERATIONS) {
  if ([...passphrase].length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  const b64 = (u8) => Buffer.from(u8).toString("base64");
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Read one line from stdin; on a terminal the typed characters are not shown. */
function readSecret(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(prompt); };
    }
    rl.question(prompt, (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const name = (arg("name") ?? "").trim();
  const role = arg("role") ?? "super_admin";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("--email must be a valid email.");
  if (!name || name.length > 120) throw new Error("--name is required (max 120 characters).");
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(", ")}.`);
  if (process.argv.some((a) => a.startsWith("--pass"))) throw new Error("Passphrases are read from stdin only.");

  const first = await readSecret("Passphrase (min 14 characters): ");
  if (process.stdin.isTTY) {
    const second = await readSecret("Repeat passphrase: ");
    if (first !== second) throw new Error("Passphrases do not match.");
  }
  const hash = await hashPassphrase(first);

  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (files.length !== 1) throw new Error(`Expected one D1 sqlite file in ${dir}, found ${files.length}.`);
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(dir, files[0]));
  try {
    const exists = db.prepare("SELECT id FROM staff_users WHERE email = ?").get(email);
    if (exists) throw new Error("A staff account with that email already exists.");
    db.prepare(
      "INSERT INTO staff_users (email, display_name, role, password_hash, created_at, failed_count) VALUES (?, ?, ?, ?, ?, 0)",
    ).run(email, name, role, hash, new Date().toISOString());
  } finally {
    db.close();
  }
  console.log(`Created ${role} account for ${email}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`create-staff: ${error.message}`);
    process.exit(1);
  });
}
