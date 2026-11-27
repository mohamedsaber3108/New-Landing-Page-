// Staff cookie sessions (L-A1a, ADMIN.md s.6).
//  - Cookie: HttpOnly; Secure; SameSite=Strict; Path=/api/v1/admin.
//  - Idle timeout 30 min, absolute 8 h.
//  - The cookie holds 32 random bytes; the DB stores only their SHA-256.
//  - Writes made with a session must pass an Origin check (CSRF).

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staffSessions, staffUsers, type StaffUser } from "@/db/schema";
import { siteUrl } from "@/lib/site";
import type { Db } from "./idempotency";

export const SESSION_COOKIE = "usam_staff_session";
export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60_000;
const TOUCH_EVERY_MS = 60_000; // write last_seen_at at most once a minute
const COOKIE_PATH = "/api/v1/admin";

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
    }
  }
  return null;
}

/**
 * CSRF guard for writes made with a session cookie. The Origin header must be
 * the request's own origin or the public site origin (USAM_SITE_URL). A missing
 * Origin is refused: browsers send it on every cross-site and same-site POST.
 */
export function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>();
  try { allowed.add(new URL(request.url).origin); } catch { /* ignore */ }
  try { allowed.add(new URL(siteUrl()).origin); } catch { /* ignore */ }
  return allowed.has(origin);
}

export function isWrite(request: Request): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
}

function db(): Db {
  return getDb() as unknown as Db;
}

/**
 * HMAC-SHA256 of the client IP with the server-side secret
 * USAM_SESSION_HASH_SALT (name only; value in ~/.usam/dev.vars). A plain hash
 * of an IPv4 address can be reversed by trying all 4 billion, so with no salt
 * set NOTHING is stored (null): no ip_hash rather than a weak one.
 */
export async function keyedIpHash(ip: string | null): Promise<string | null> {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const salt = env.USAM_SESSION_HASH_SALT;
  if (!ip || !salt) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)));
}

/** L-A1b session stages; see db/schema.ts staffSessions.stage. */
export type SessionStage = "full" | "mfa_pending" | "enrol_only";
/** Lifetime of the "waiting for the MFA code" and "set up MFA" stages. */
export const PENDING_MFA_MS = 5 * 60_000;
export const ENROL_ONLY_MS = 15 * 60_000;

export function stageLifetimeMs(stage: SessionStage): number {
  return stage === "mfa_pending" ? PENDING_MFA_MS : stage === "enrol_only" ? ENROL_ONLY_MS : SESSION_ABSOLUTE_MS;
}

/** Create a session for `user`; returns the cookie value (raw, only in the Set-Cookie). */
export async function createSession(
  user: StaffUser,
  request: Request,
  ip: string | null,
  opts: { stage?: SessionStage; mfaVerified?: boolean } = {},
): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  const stage = opts.stage ?? "full";
  await db().insert(staffSessions).values({
    id: await sha256Hex(token),
    userId: user.id,
    createdAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(now + stageLifetimeMs(stage)).toISOString(),
    ipHash: await keyedIpHash(ip),
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 120) || null,
    stage,
    mfaVerifiedAt: opts.mfaVerified ? new Date(now).toISOString() : null,
  });
  return token;
}

/** Record a successful MFA check in this session (step-up). */
export async function markMfaVerified(sessionId: string): Promise<void> {
  await db().update(staffSessions).set({ mfaVerifiedAt: new Date().toISOString() }).where(eq(staffSessions.id, sessionId));
}

export type ActiveSession = { sessionId: string; user: StaffUser; stage: SessionStage; mfaVerifiedAt: string | null };

/** The live session for this request, or null (missing, unknown, idle, expired, user disabled). */
export async function getSession(request: Request): Promise<ActiveSession | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const id = await sha256Hex(token);
  const rows = await db().select().from(staffSessions).where(eq(staffSessions.id, id)).limit(1);
  const session = rows[0];
  if (!session) return null;
  const now = Date.now();
  if (Date.parse(session.expiresAt) <= now) return null;
  if (Date.parse(session.lastSeenAt) + SESSION_IDLE_MS <= now) return null;
  const users = await db().select().from(staffUsers).where(eq(staffUsers.id, session.userId)).limit(1);
  const user = users[0];
  if (!user || user.disabledAt) return null;
  if (now - Date.parse(session.lastSeenAt) >= TOUCH_EVERY_MS) {
    await db()
      .update(staffSessions)
      .set({ lastSeenAt: new Date(now).toISOString() })
      .where(and(eq(staffSessions.id, id)));
  }
  return { sessionId: id, user, stage: (session.stage ?? "full") as SessionStage, mfaVerifiedAt: session.mfaVerifiedAt ?? null };
}

/** End a session now (logout). Rows are kept until a cleanup job exists. */
export async function revokeSession(sessionId: string): Promise<void> {
  await db().update(staffSessions).set({ expiresAt: new Date().toISOString() }).where(eq(staffSessions.id, sessionId));
}
