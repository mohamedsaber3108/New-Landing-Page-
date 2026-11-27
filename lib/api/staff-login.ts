// Staff sign-in / sign-out / who-am-I (L-A1a).
//  - Per-IP rate limit (staffLogin); lockout per account + IP pair plus an
//    account-wide backstop (lib/api/staff-lockout.ts).
//  - Unknown email, disabled account, wrong passphrase and locked account all
//    get the same 401 and body, after exactly one PBKDF2 derive.
//  - Origin check (CSRF) on sign-in and sign-out.

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staffUsers, type StaffUser } from "@/db/schema";
import { fail, ok } from "./envelope";
import type { Db } from "./idempotency";
import { clientIp, rateLimit } from "./rate-limit";
import { DUMMY_HASH, verifyPassphrase } from "./staff-password";
import { accountLocked, clearAccountFailures, pairLocked, recordAccountFailure, recordPairFailure } from "./staff-lockout";
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
    const found = rows[0];
    const user = found && !found.disabledAt ? found : null;
    const now = Date.now();
    const ip = clientIp(request);

    // Exactly ONE PBKDF2 on every path (dummy hash when there is no usable
    // account), and the same 401 + body for unknown, disabled, wrong and
    // locked, so neither status nor timing reveals which it was.
    const passOk = await verifyPassphrase(parsed.data.passphrase, user ? user.passwordHash : DUMMY_HASH);
    if (!user) return fail({ code: "unauthenticated", message: BAD_LOGIN, requestId });

    const locked = pairLocked(request, user.id, ip) || accountLocked(user.lockedUntil, now);
    if (!passOk || locked) {
      if (!passOk) {
        recordPairFailure(request, user.id, ip);
        await recordAccountFailure(db(), user.id, now);
      }
      return fail({ code: "unauthenticated", message: BAD_LOGIN, requestId });
    }

    await clearAccountFailures(db(), user.id);
    const token = await createSession(user, request, ip);
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
