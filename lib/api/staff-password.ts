// Staff passphrase hashing (L-A1a): Web Crypto PBKDF2-SHA256, the same code
// in workerd (Miniflare, production) and Node (tests, scripts/create-staff.mjs).
//
// Iterations: 600,000 = the OWASP 2023 figure for PBKDF2-HMAC-SHA256.
// Checked locally on the workerd build in this lockfile (Miniflare): 100,000,
// 100,001, 210,000 and 600,000 all derive (600k in ~77 ms). Hosted Cloudflare
// Workers have been reported to cap PBKDF2 at 100,000; this site runs on its
// own workerd behind nginx, so that cap does not apply here.
// shortcut: if the site ever moves to hosted Workers, lower ITERATIONS to the
// platform cap and require MFA for every staff account (PLAN L-A1 build note).
//
// Stored format: "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>", so the
// count can change later without breaking stored hashes.

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 14;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

export function passphraseProblem(passphrase: string): string | null {
  if (typeof passphrase !== "string" || [...passphrase].length < MIN_PASSPHRASE_LENGTH) {
    return `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  }
  return null;
}

export async function hashPassphrase(passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const problem = passphraseProblem(passphrase);
  if (problem) throw new Error(problem);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(passphrase, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(hash)}`;
}

/** Constant-time compare of the derived hash. Malformed stored values never match. */
export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return false;
  const salt = unb64(parts[2]);
  const expected = unb64(parts[3]);
  const actual = await derive(String(passphrase ?? ""), salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

/** A fixed, valid hash used to spend the same time when the email is unknown. */
export const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;
