// Staff MFA building blocks (L-A1b, ADMIN.md s.6, ADMIN_FOUNDATION.md s.6/s.9).
//  - TOTP per RFC 6238: HMAC-SHA1, 6 digits, 30 s steps, +-1 step of clock
//    drift. Web Crypto only, no package.
//  - The TOTP secret is stored AES-GCM encrypted with a key derived from env
//    USAM_MFA_ENCRYPTION_KEY (32+ characters). Without it MFA cannot be set up
//    or checked (MfaNotConfigured); a secret is never stored in plain text.
//  - Replay guard: staff_users.mfa_last_step is moved forward with one atomic
//    UPDATE, so a time step (and so a code) is accepted at most once.
//  - 10 one-time backup codes, shown once; only an HMAC (keyed from the same
//    env key) is stored, and a code is spent with one atomic UPDATE.

import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { staffBackupCodes, staffUsers, type StaffUser } from "@/db/schema";
import type { Db } from "./idempotency";

export const TOTP_PERIOD_S = 30;
export const TOTP_DIGITS = 6;
export const TOTP_DRIFT_STEPS = 1;
export const BACKUP_CODE_COUNT = 10;
export const MIN_MFA_KEY_LENGTH = 32;
const ISSUER = "USAM";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
// Backup codes: no 0/O/1/I, 32 symbols so `byte & 31` is unbiased.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BACKUP_CODE_LENGTH = 10; // 50 bits, shown as XXXXX-XXXXX

const db = () => getDb() as unknown as Db;
const enc = new TextEncoder();

export class MfaNotConfigured extends Error {
  constructor() {
    super(`MFA is not available: USAM_MFA_ENCRYPTION_KEY is not set (${MIN_MFA_KEY_LENGTH}+ characters).`);
  }
}

/** The stored secret cannot be decrypted: the key changed or the row is damaged. */
export class MfaSecretUnreadable extends Error {
  constructor() {
    super("MFA for this account cannot be checked. Ask the owner to reset MFA for this account.");
  }
}

function keyMaterial(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const key = env.USAM_MFA_ENCRYPTION_KEY;
  if (!key || key.length < MIN_MFA_KEY_LENGTH) throw new MfaNotConfigured();
  return key;
}

/** Separate 256-bit keys for encryption and for backup-code hashing. */
async function subKey(purpose: "aes" | "backup"): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`usam-mfa-${purpose}:${keyMaterial()}`));
  return purpose === "aes"
    ? crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
    : crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** RFC 4226 HOTP value for one counter (RFC 6238: counter = time step). */
async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg.buffer));
  const offset = mac[mac.length - 1] & 15;
  const bin = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function timeStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_S);
}

/** TOTP code for a base32 secret at a time (tests and authenticator apps). */
export function totp(secretBase32: string, nowMs = Date.now()): Promise<string> {
  return hotp(base32Decode(secretBase32), timeStep(nowMs));
}

export function otpauthUri(email: string, secretBase32: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${ISSUER}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_S}`;
}

/** AES-GCM, bound to the user id (AAD), stored as "v1:<iv b64>:<ciphertext b64>". */
export async function encryptSecret(secretBase32: string, userId: number): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(`staff:${userId}`) },
    await subKey("aes"),
    enc.encode(secretBase32),
  );
  return `v1:${b64(iv)}:${b64(new Uint8Array(ct))}`;
}

/** Throws MfaNotConfigured (no key) or MfaSecretUnreadable (wrong key, bad data). */
export async function decryptSecret(stored: string, userId: number): Promise<string> {
  const key = await subKey("aes"); // MfaNotConfigured passes through
  try {
    const [version, iv, ct] = stored.split(":");
    if (version !== "v1" || !iv || !ct) throw new Error("format");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) as BufferSource, additionalData: enc.encode(`staff:${userId}`) },
      key,
      unb64(ct) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new MfaSecretUnreadable();
  }
}

/**
 * mfa/setup: a new secret for `user` (replaces an earlier unconfirmed one).
 * Returns the secret and otpauth URI; they are shown once and never again.
 * Throws MfaNotConfigured when the encryption key is missing.
 */
export async function startEnrolment(user: StaffUser): Promise<{ secret: string; otpauthUri: string } | null> {
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  const stored = await encryptSecret(secret, user.id);
  // Atomic: only while MFA is off, so a repeated or parallel setup can never
  // replace the secret of (or un-enrol) a user who already turned MFA on.
  const updated = await db()
    .update(staffUsers)
    .set({ mfaSecretEnc: stored, mfaLastStep: 0 })
    .where(and(eq(staffUsers.id, user.id), isNull(staffUsers.mfaEnabledAt)))
    .returning({ id: staffUsers.id });
  if (updated.length !== 1) return null; // MFA already on
  return { secret, otpauthUri: otpauthUri(user.email, secret) };
}

/**
 * Check a 6-digit TOTP code (+-1 step). A match is accepted only if its step
 * is later than the last accepted one, moved forward in one atomic UPDATE, so
 * the same code (or an older one) cannot be used twice.
 */
export async function verifyTotp(user: StaffUser, code: string): Promise<boolean> {
  if (!user.mfaSecretEnc || !/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(await decryptSecret(user.mfaSecretEnc, user.id));
  const now = timeStep();
  let matched = -1;
  for (let d = -TOTP_DRIFT_STEPS; d <= TOTP_DRIFT_STEPS; d++) {
    // All candidates are computed (no early exit); the latest match wins.
    if (equalCodes(await hotp(secret, now + d), code)) matched = now + d;
  }
  if (matched < 0) return false;
  const moved = await db()
    .update(staffUsers)
    .set({ mfaLastStep: matched })
    .where(and(eq(staffUsers.id, user.id), lt(staffUsers.mfaLastStep, matched)))
    .returning({ id: staffUsers.id });
  return moved.length === 1;
}

function equalCodes(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Spaces and dashes are ignored, case too (codes are often pasted).
 * Arabic-Indic (U+0660-0669) and Eastern Arabic-Indic (U+06F0-06F9) digits
 * become 0-9, so a code typed on an Arabic keyboard works.
 */
export function normalizeCode(code: string): string {
  return code
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

async function backupHash(normalized: string): Promise<string> {
  return hex(await crypto.subtle.sign("HMAC", await subKey("backup"), enc.encode(normalized)));
}

/**
 * Replace the user's backup codes with BACKUP_CODE_COUNT new ones. Old unused
 * codes stop working. Returns the plain codes: show them once, never store.
 */
export async function issueBackupCodes(userId: number): Promise<string[]> {
  const now = new Date().toISOString();
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(BACKUP_CODE_LENGTH)), (b) => CODE_ALPHABET[b & 31]).join("");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    hashes.push(await backupHash(raw));
  }
  await db().update(staffBackupCodes).set({ usedAt: now }).where(and(eq(staffBackupCodes.userId, userId), isNull(staffBackupCodes.usedAt)));
  for (const codeHash of hashes) await db().insert(staffBackupCodes).values({ userId, codeHash, createdAt: now });
  return codes;
}

/** Spend one backup code: true once, then false for ever (atomic UPDATE). */
export async function spendBackupCode(userId: number, code: string): Promise<boolean> {
  const normalized = normalizeCode(code);
  if (normalized.length !== BACKUP_CODE_LENGTH || [...normalized].some((c) => !CODE_ALPHABET.includes(c))) return false;
  const codeHash = await backupHash(normalized);
  const rows = await db()
    .select({ id: staffBackupCodes.id })
    .from(staffBackupCodes)
    .where(and(eq(staffBackupCodes.userId, userId), eq(staffBackupCodes.codeHash, codeHash), isNull(staffBackupCodes.usedAt)))
    .limit(1);
  if (!rows[0]) return false;
  const spent = await db()
    .update(staffBackupCodes)
    .set({ usedAt: new Date().toISOString() })
    .where(and(eq(staffBackupCodes.id, rows[0].id), isNull(staffBackupCodes.usedAt)))
    .returning({ id: staffBackupCodes.id });
  return spent.length === 1;
}

/** Sign-in and step-up: a TOTP code or a backup code, for a user with MFA on. */
export async function checkMfaCode(user: StaffUser, code: string): Promise<boolean> {
  if (!user.mfaEnabledAt || !user.mfaSecretEnc) return false;
  const normalized = normalizeCode(code);
  return /^\d{6}$/.test(normalized) ? verifyTotp(user, normalized) : spendBackupCode(user.id, normalized);
}
