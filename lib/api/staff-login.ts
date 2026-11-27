// Staff sign-in / sign-out / who-am-I (L-A1a).
//  - Per-IP rate limit (staffLogin) and per-account lockout: 5 failed
//    sign-ins lock the account for 15 minutes.
//  - Unknown email, wrong passphrase and disabled account all get the same
//    401 message, and an unknown email still runs one PBKDF2 derive.
//  - Origin check (CSRF) on sign-in and sign-out.

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staffUsers, type StaffUser } from "@/db/schema";
import { fail, ok } from "./envelope";
import type { Db } from "./idempotency";
import { clientIp, rateLimit } from "./rate-limit";
import { DUMMY_HASH, verifyPassphrase } from "./staff-password";
import { ROLE_PERMISSIONS, type StaffRole } from "./staff-permissions";
import {
  SESSION_ABSOLUTE_MS,
  clearSessionCookie,
  createSession,
  getSession,
  originAllowed,
  revokeSession,
  sessionCookie,
} from "./staff-session";

export const MAX_FAILED_SIGNINS = 5;
export const LOCKOUT_MS = 15 * 60_000;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  passphrase: z.string().min(1).max(1024),
});

const db = () => getDb() as unknown as Db;
const BAD_LOGIN = "Email or passphrase is not correct.";

function publicUser(user: StaffUser) {
  return {
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role as StaffRole] ?? [],
  };
}

export async function login(request: Request, requestId: string): Promise<Response> {
  const limited = rateLimit(request, "staffLogin", requestId);
  if (limited) return limited;
  if (!originAllowed(request)) return fail({ code: "forbidden", message: "Request origin is not allowed.", requestId });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
  }
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return fail({ code: "validation_failed", message: "Email and passphrase are required.", requestId });

  try {
    const rows = await db().select().from(staffUsers).where(eq(staffUsers.email, parsed.data.email)).limit(1);
    const user = rows[0];
    const now = Date.now();

    if (!user || user.disabledAt) {
      await verifyPassphrase(parsed.data.passphrase, DUMMY_HASH); // same cost as a real check
      return fail({ code: "unauthenticated", message: BAD_LOGIN, requestId });
    }
    if (user.lockedUntil && Date.parse(user.lockedUntil) > now) {
      const seconds = Math.ceil((Date.parse(user.lockedUntil) - now) / 1000);
      return fail({
        code: "rate_limited",
        message: "Too many failed sign-ins. Try again later.",
        requestId,
        headers: { "Retry-After": String(seconds) },
      });
    }

    if (!(await verifyPassphrase(parsed.data.passphrase, user.passwordHash))) {
      const failed = (user.failedCount ?? 0) + 1;
      const lock = failed >= MAX_FAILED_SIGNINS;
      await db()
        .update(staffUsers)
        .set(lock ? { failedCount: 0, lockedUntil: new Date(now + LOCKOUT_MS).toISOString() } : { failedCount: failed })
        .where(eq(staffUsers.id, user.id));
      return fail({ code: "unauthenticated", message: BAD_LOGIN, requestId });
    }

    await db().update(staffUsers).set({ failedCount: 0, lockedUntil: null }).where(eq(staffUsers.id, user.id));
    const token = await createSession(user, request, clientIp(request));
    return ok(
      { user: publicUser(user) },
      { requestId, headers: { "Set-Cookie": sessionCookie(token, SESSION_ABSOLUTE_MS / 1000), "Cache-Control": "no-store" } },
    );
  } catch {
    return fail({ code: "dependency_unavailable", message: "Staff account store is unavailable.", requestId });
  }
}

export async function logout(request: Request, requestId: string): Promise<Response> {
  if (!originAllowed(request)) return fail({ code: "forbidden", message: "Request origin is not allowed.", requestId });
  try {
    const session = await getSession(request);
    if (session) await revokeSession(session.sessionId);
  } catch {
    // Still clear the cookie below.
  }
  return ok({ signedOut: true }, { requestId, headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
}

export async function me(request: Request, requestId: string): Promise<Response> {
  let session;
  try {
    session = await getSession(request);
  } catch {
    return fail({ code: "dependency_unavailable", message: "Staff session store is unavailable.", requestId });
  }
  if (!session) return fail({ code: "unauthenticated", message: "Not signed in.", requestId });
  return ok({ user: publicUser(session.user) }, { requestId, headers: { "Cache-Control": "no-store" } });
}
