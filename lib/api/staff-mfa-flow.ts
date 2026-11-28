// Staff MFA endpoints (L-A1b). Building blocks are in lib/api/staff-mfa.ts.
//
//   POST auth/login/mfa         second sign-in step: TOTP or backup code -> session
//   POST auth/mfa/setup         new secret; returns otpauth URI + secret once
//   POST auth/mfa/verify        first TOTP code turns MFA on; returns 10 backup codes once
//   POST auth/mfa/backup-codes  new backup codes (needs step-up)
//   POST auth/mfa/step-up       fresh MFA check for sensitive actions (5 min)
//
// Every code check: per-IP rate limit (staffMfa), and the sign-in lockout
// (account + IP pair, and the account backstop) counts wrong codes too. A wrong
// code, a used code, a locked account and a missing or expired MFA step all
// get the same 401 and body. Codes may be pasted; spaces and dashes are ignored.

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { staffUsers } from "@/db/schema";
import { fail, ok } from "./envelope";
import type { Db } from "./idempotency";
import { clientIp, limitKey, rateLimit } from "./rate-limit";
import { publicUser } from "./staff-login";
import { accountLocked, clearAccountFailures, pairLocked, recordAccountFailure, recordPairFailure } from "./staff-lockout";
import { MfaNotConfigured, MfaSecretUnreadable, checkMfaCode, issueBackupCodes, normalizeCode, startEnrolment, verifyTotp } from "./staff-mfa";
import { auditSensitive, stepUpFresh, stepUpNeeded } from "./admin-auth";
import { appendAudit, staffActor, type AuditAction } from "./audit";
import { STEP_UP_MS } from "./staff-permissions";
import {
  createSession,
  getSession,
  markMfaVerified,
  originAllowed,
  revokeSession,
  sessionCookie,
  stageLifetimeMs,
  type ActiveSession,
  type SessionStage,
} from "./staff-session";

const db = () => getDb() as unknown as Db;
export const BAD_CODE = "The code is not correct.";
const codeSchema = z.object({ code: z.string().min(1).max(64) });
const NO_STORE = { "Cache-Control": "no-store" };

type Step = { session: ActiveSession; code: string };

/** Shared start of every MFA request: limit, Origin, session in an allowed stage, body. */
async function begin(
  request: Request,
  requestId: string,
  stages: SessionStage[],
  withCode: boolean,
): Promise<Response | Step> {
  const limited = rateLimit(request, "staffMfa", requestId);
  if (limited) return limited;
  if (!originAllowed(request)) return fail({ code: "forbidden", message: "Request origin is not allowed.", requestId });
  let code = "";
  if (withCode) {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
    }
    const parsed = codeSchema.safeParse(raw);
    if (!parsed.success) return fail({ code: "validation_failed", message: "A code is required.", requestId });
    code = parsed.data.code;
  }
  const session = await getSession(request);
  if (!session || !stages.includes(session.stage)) {
    return withCode
      ? fail({ code: "unauthenticated", message: BAD_CODE, requestId })
      : fail({ code: "unauthenticated", message: "Not signed in.", requestId });
  }
  return { session, code };
}

/**
 * Run `check` unless locked. A failure counts like a wrong passphrase (account
 * + IP pair and the account backstop) and, on a pre-MFA session (mfa_pending /
 * enrol_only), against that session: the 5th wrong code (RATE_LIMITS.staffMfaSession) ends it, so a stolen pending
 * cookie cannot be used to keep guessing from many IPs.
 * shortcut: the per-session count is in process memory like the other limits;
 * the revoke itself is in D1. Move the count to D1 if more than one instance runs.
 */
async function guarded(request: Request, step: Step, action: AuditAction, check: () => Promise<boolean>): Promise<boolean> {
  const { user, sessionId, stage } = step.session;
  const ip = clientIp(request);
  const now = Date.now();
  const audit = (result: "success" | "denied", why?: string) =>
    appendAudit(request, { actor: staffActor(user), action, result, after: why ? { denied: why } : undefined });
  if (pairLocked(request, user.id, ip) || accountLocked(user.lockedUntil, now)) {
    await audit("denied", "locked");
    return false;
  }
  const passed = await check();
  await audit(passed ? "success" : "denied", passed ? undefined : "bad_code");
  if (!passed) {
    recordPairFailure(request, user.id, ip);
    await recordAccountFailure(db(), user.id, now);
    if (stage !== "full") {
      limitKey(request, "staffMfaSession", sessionId, "-");
      if (limitKey(request, "staffMfaSession", sessionId, "-", { count: false })) await revokeSession(sessionId);
    }
  }
  return passed;
}

/** Replace the current session row by a new full session with a fresh MFA check. */
async function upgrade(request: Request, step: Step): Promise<string> {
  await revokeSession(step.session.sessionId);
  await clearAccountFailures(db(), step.session.user.id);
  const token = await createSession(step.session.user, request, clientIp(request), { stage: "full", mfaVerified: true });
  return sessionCookie(token, stageLifetimeMs("full") / 1000);
}

async function run(requestId: string, body: () => Promise<Response>): Promise<Response> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof MfaNotConfigured) return fail({ code: "dependency_unavailable", message: e.message, requestId });
    if (e instanceof MfaSecretUnreadable) return fail({ code: "internal_error", message: e.message, requestId });
    return fail({ code: "dependency_unavailable", message: "Staff account store is unavailable.", requestId });
  }
}

export function loginMfa(request: Request, requestId: string): Promise<Response> {
  return run(requestId, async () => {
    const step = await begin(request, requestId, ["mfa_pending"], true);
    if (step instanceof Response) return step;
    const passed = await guarded(request, step, "auth:login-mfa", () => checkMfaCode(step.session.user, step.code));
    if (!passed) return fail({ code: "unauthenticated", message: BAD_CODE, requestId });
    const cookie = await upgrade(request, step);
    return ok({ user: publicUser(step.session.user) }, { requestId, headers: { "Set-Cookie": cookie, ...NO_STORE } });
  });
}

export function mfaSetup(request: Request, requestId: string): Promise<Response> {
  return run(requestId, async () => {
    const step = await begin(request, requestId, ["enrol_only", "full"], false);
    if (step instanceof Response) return step;
    if (step.session.user.mfaEnabledAt) return fail({ code: "conflict", message: "MFA is already on for this account.", requestId });
    const started = await startEnrolment(step.session.user);
    // Turned on by a parallel request between the read and the UPDATE.
    if (!started) return fail({ code: "conflict", message: "MFA is already on for this account.", requestId });
    const { secret, otpauthUri } = started;
    await appendAudit(request, { actor: staffActor(step.session.user), action: "auth:mfa-setup", result: "success", requestId });
    return ok({ otpauthUri, secret }, { requestId, headers: NO_STORE });
  });
}

export function mfaVerify(request: Request, requestId: string): Promise<Response> {
  return run(requestId, async () => {
    const step = await begin(request, requestId, ["enrol_only", "full"], true);
    if (step instanceof Response) return step;
    const user = step.session.user;
    // No set-up in progress is answered like a wrong code.
    if (user.mfaEnabledAt || !user.mfaSecretEnc) return fail({ code: "unauthenticated", message: BAD_CODE, requestId });
    const passed = await guarded(request, step, "auth:mfa-verify", () => verifyTotp(user, normalizeCode(step.code)));
    if (!passed) return fail({ code: "unauthenticated", message: BAD_CODE, requestId });
    // Atomic: only if MFA is still off AND the secret is the one just checked
    // (a parallel setup may have replaced it), so the app and the DB agree.
    const enabled = await db()
      .update(staffUsers)
      .set({ mfaEnabledAt: new Date().toISOString() })
      .where(and(eq(staffUsers.id, user.id), isNull(staffUsers.mfaEnabledAt), eq(staffUsers.mfaSecretEnc, user.mfaSecretEnc)))
      .returning({ id: staffUsers.id });
    if (enabled.length !== 1) return fail({ code: "unauthenticated", message: BAD_CODE, requestId });
    const backupCodes = await issueBackupCodes(user.id);
    const cookie = await upgrade(request, step);
    return ok({ user: publicUser(user), backupCodes }, { requestId, headers: { "Set-Cookie": cookie, ...NO_STORE } });
  });
}

export function mfaBackupCodes(request: Request, requestId: string): Promise<Response> {
  return run(requestId, async () => {
    const step = await begin(request, requestId, ["full"], false);
    if (step instanceof Response) return step;
    if (!step.session.user.mfaEnabledAt) return fail({ code: "conflict", message: "MFA is not on for this account.", requestId });
    const actor = staffActor(step.session.user);
    if (!stepUpFresh(step.session)) {
      await appendAudit(request, { actor, action: "auth:mfa-backup-codes", result: "denied", requestId, after: { denied: "step_up" } });
      return stepUpNeeded(requestId);
    }
    // Sensitive (L-A2): the entry is written first; no entry, no new codes.
    const auditDenied = await auditSensitive(request, requestId, { action: "auth:mfa-backup-codes", targetType: "staff_user", targetId: step.session.user.id }, actor);
    if (auditDenied) return auditDenied;
    return ok({ backupCodes: await issueBackupCodes(step.session.user.id) }, { requestId, headers: NO_STORE });
  });
}

export function mfaStepUp(request: Request, requestId: string): Promise<Response> {
  return run(requestId, async () => {
    const step = await begin(request, requestId, ["full"], true);
    if (step instanceof Response) return step;
    const passed = await guarded(request, step, "auth:mfa-step-up", () => checkMfaCode(step.session.user, step.code));
    if (!passed) return fail({ code: "unauthenticated", message: BAD_CODE, requestId });
    await markMfaVerified(step.session.sessionId);
    return ok({ verifiedUntil: new Date(Date.now() + STEP_UP_MS).toISOString() }, { requestId, headers: NO_STORE });
  });
}
