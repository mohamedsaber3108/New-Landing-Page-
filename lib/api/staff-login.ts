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
import { ROLE_PERMISSIONS, mfaRequired, type StaffRole } from "./staff-permissions";
import {
  clearSessionCookie,
  createSession,
  getSession,
  originAllowed,
  revokeSession,
  sessionCookie,
  stageLifetimeMs,
  type SessionStage,
} from "./staff-session";


const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  passphrase: z.string().min(1).max(1024),
});

const db = () => getDb() as unknown as Db;
const BAD_LOGIN = "Email or passphrase is not correct.";

export function publicUser(user: StaffUser) {
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

    // L-A1b: with MFA on, the passphrase only opens a 5-minute "mfa_pending"
    // step; the real session is created by auth/login/mfa after the code.
    // A role that must use MFA but has not set it up gets an "enrol_only"
    // session that can do nothing but auth/mfa/setup and auth/mfa/verify.
    const stage: SessionStage = user.mfaEnabledAt ? "mfa_pending" : mfaRequired(user.role) ? "enrol_only" : "full";
    // The account backstop is cleared only after the whole sign-in succeeds.
    if (stage !== "mfa_pending") await clearAccountFailures(db(), user.id);
    const token = await createSession(user, request, ip, { stage });
    const data = stage === "mfa_pending" ? { mfaRequired: true } : { user: publicUser(user), mfaSetupRequired: stage === "enrol_only" };
    return ok(data, {
      requestId,
      headers: { "Set-Cookie": sessionCookie(token, stageLifetimeMs(stage) / 1000), "Cache-Control": "no-store" },
    });
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
  if (!session || session.stage === "mfa_pending") return fail({ code: "unauthenticated", message: "Not signed in.", requestId });
  const enabled = Boolean(session.user.mfaEnabledAt);
  const required = mfaRequired(session.user.role);
  return ok(
    { user: publicUser(session.user), mfa: { enabled, required, setupRequired: session.stage === "enrol_only" || (required && !enabled) } },
    { requestId, headers: { "Cache-Control": "no-store" } },
  );
}
