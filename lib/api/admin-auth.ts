// Shared server-side admin authorization for operations endpoints.
//
// Two ways in (L-A1a):
//  1. A staff session cookie (lib/api/staff-session.ts) for a named person with
//     one of three roles. The route's permission is checked against the fixed
//     list in lib/api/staff-permissions.ts (wrong role -> 403). Writes made with
//     a session must pass the Origin check (CSRF -> 403).
//     L-A1b: MFA is required for super_admin and admin, and sensitive
//     permissions (STEP_UP_PERMISSIONS) need a step-up check within 5 min.
//  2. Break-glass: the shared `x-admin-token` header against env
//     `USAM_ADMIN_TOKEN`, unchanged from before. Full access. Used by trusted
//     tools (curl), never by the website. A request that sends the header is
//     judged on the token only.
//
// FAIL CLOSED: with no valid session and no token configured, every admin
// request is denied (403); with a token configured, a missing or wrong token is
// 401. A public admin URL must be rejected by the server, never merely hidden.
//
// Token rule: random (e.g. `openssl rand -hex 32`), at least 32 characters,
// rotated whenever staff with access change, and never pasted in chat,
// tickets or the repo.
//
// Every admin request is rate limited per IP (see rate-limit.ts) before any
// check. With no client IP, only failed checks count.
//
// L-A2 audit (lib/api/audit.ts): every allowed request and every denied try
// is logged (best effort). Sensitive permissions (STEP_UP_PERMISSIONS) are
// refused while the audit log cannot be written; their route calls
// auditSensitive() BEFORE acting, so no entry means no action.
//
// Returns null when authorized; otherwise a ready-to-return error Response.

import { fail } from "./envelope";
import { clientIp, limitKey } from "./rate-limit";
import { STEP_UP_MS, STEP_UP_PERMISSIONS, mfaRequired, roleHas, type Permission } from "./staff-permissions";
import { getSession, isWrite, originAllowed, readSessionCookie, type ActiveSession } from "./staff-session";
import { AuditUnavailable, appendAudit, auditConfigured, staffActor, type AuditActor, type AuditEntry } from "./audit";

/** True when this session passed an MFA check less than STEP_UP_MS ago. */
export function stepUpFresh(session: ActiveSession): boolean {
  return Boolean(session.mfaVerifiedAt) && Date.now() - Date.parse(session.mfaVerifiedAt as string) < STEP_UP_MS;
}

export function stepUpNeeded(requestId: string): Response {
  return fail({ code: "forbidden", message: "This action needs a fresh MFA code. Confirm with auth/mfa/step-up and try again.", requestId });
}

function configuredToken(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return env.USAM_ADMIN_TOKEN;
}

export function adminConfigured(): boolean {
  return Boolean(configuredToken());
}

/**
 * Authorize an admin request for `permission`. On failure returns an error
 * Response to return directly; on success returns null (proceed).
 */
export async function authorizeAdmin(request: Request, requestId: string, permission: Permission): Promise<Response | null> {
  // Limit first, so guessing is slowed even when the credential is wrong.
  // With a client IP every request counts. With no IP all callers would share
  // one key, so there only FAILED checks count: an attacker cannot use up the
  // quota of an admin who sends the right credential.
  const ip = clientIp(request);
  const limited = limitKey(request, "admin", ip ?? "unknown", requestId, { count: Boolean(ip) });
  if (limited) return limited;
  const ctx: CheckContext = { actor: { type: "anonymous" }, why: "" };
  const denied = await check(request, requestId, permission, ctx);
  if (denied && !ip) limitKey(request, "admin", "unknown", requestId);
  // L-A2: every denied try is logged (best effort; no personal data, the
  // actor is an id). Rate-limited requests are not, so a flood cannot fill it.
  if (denied) {
    if (ctx.why) await appendAudit(request, { actor: ctx.actor, action: permission, result: "denied", requestId, after: { denied: ctx.why } });
    return denied;
  }
  ACTORS.set(request, ctx.actor);
  if (STEP_UP_PERMISSIONS.includes(permission)) {
    // Sensitive: the route writes a REQUIRED entry before acting
    // (auditSensitive). Refuse at once when the log cannot be written.
    if (!auditConfigured()) return fail({ code: "dependency_unavailable", message: new AuditUnavailable("key").message, requestId });
    return null;
  }
  await appendAudit(request, { actor: ctx.actor, action: permission, result: "success", requestId });
  return null;
}

/** Who passed authorizeAdmin() for this request (for the audit entry). */
const ACTORS = new WeakMap<Request, AuditActor>();

/**
 * Sensitive action (ADMIN.md s.5): write the audit entry BEFORE doing it.
 * Returns null to go on, or a 503 to return: no entry, no action.
 */
export async function auditSensitive(
  request: Request,
  requestId: string,
  entry: Omit<AuditEntry, "actor" | "result" | "requestId">,
  actor: AuditActor = ACTORS.get(request) ?? { type: "anonymous" },
): Promise<Response | null> {
  try {
    await appendAudit(request, { ...entry, actor, result: "success", requestId }, { required: true });
    return null;
  } catch (e) {
    const message = e instanceof AuditUnavailable ? e.message : new AuditUnavailable("write").message;
    return fail({ code: "dependency_unavailable", message, requestId });
  }
}

/** After a sensitive action that failed once started: best-effort "failed" entry. */
export async function auditFailed(request: Request, requestId: string, entry: Omit<AuditEntry, "actor" | "result" | "requestId">): Promise<void> {
  await appendAudit(request, { ...entry, actor: ACTORS.get(request) ?? { type: "anonymous" }, result: "failed", requestId });
}

type CheckContext = { actor: AuditActor; why: string };

async function check(request: Request, requestId: string, permission: Permission, ctx: CheckContext): Promise<Response | null> {
  // Break-glass token path: only when the header is sent (unchanged behaviour).
  if (request.headers.has("x-admin-token")) return checkToken(request, requestId, ctx);

  if (readSessionCookie(request)) {
    let session;
    try {
      session = await getSession(request);
    } catch {
      return fail({ code: "dependency_unavailable", message: "Staff session store is unavailable.", requestId });
    }
    if (!session) {
      ctx.why = "no_session";
      return fail({ code: "unauthenticated", message: "Your session has ended. Please sign in again.", requestId });
    }
    ctx.actor = staffActor(session.user);
    // L-A1b: only a full session counts. "mfa_pending" (code not yet given)
    // is not signed in; a role that must use MFA may only enrol until it is on
    // (this also covers sessions opened before MFA existed).
    if (session.stage === "mfa_pending") {
      ctx.why = "mfa_pending";
      return fail({ code: "unauthenticated", message: "Your session has ended. Please sign in again.", requestId });
    }
    if (session.stage !== "full" || (mfaRequired(session.user.role) && !session.user.mfaEnabledAt)) {
      ctx.why = "mfa_setup_required";
      return fail({ code: "forbidden", message: "Set up MFA for your account before using the admin area.", requestId });
    }
    if (isWrite(request) && !originAllowed(request)) {
      ctx.why = "origin";
      return fail({ code: "forbidden", message: "Request origin is not allowed.", requestId });
    }
    if (!roleHas(session.user.role, permission)) {
      ctx.why = "role";
      return fail({ code: "forbidden", message: "Your role does not allow this action.", requestId });
    }
    // Sensitive actions (ADMIN.md s.5): an MFA check in this session within 5 min.
    if (STEP_UP_PERMISSIONS.includes(permission) && !stepUpFresh(session)) {
      ctx.why = "step_up";
      return stepUpNeeded(requestId);
    }
    return null;
  }

  // Neither a session nor a token header: the same answers as before.
  return checkToken(request, requestId, ctx);
}

function checkToken(request: Request, requestId: string, ctx: CheckContext): Response | null {
  ctx.actor = request.headers.has("x-admin-token") ? { type: "break_glass" } : { type: "anonymous" };
  const token = configuredToken();
  if (!token) {
    ctx.why = "admin_disabled";
    return fail({
      code: "forbidden",
      message: "Admin operations are disabled: no USAM_ADMIN_TOKEN is configured.",
      requestId,
    });
  }
  const provided = request.headers.get("x-admin-token") ?? "";
  if (!timingSafeEqual(provided, token)) {
    ctx.why = provided ? "bad_token" : "no_credentials";
    return fail({ code: "unauthenticated", message: "Invalid or missing admin token.", requestId });
  }
  return null;
}

/** Length-independent constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
