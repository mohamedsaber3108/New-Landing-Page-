// Shared server-side admin authorization for operations endpoints.
//
// Two ways in (L-A1a):
//  1. A staff session cookie (lib/api/staff-session.ts) for a named person with
//     one of three roles. The route's permission is checked against the fixed
//     list in lib/api/staff-permissions.ts (wrong role -> 403). Writes made with
//     a session must pass the Origin check (CSRF -> 403).
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
// Returns null when authorized; otherwise a ready-to-return error Response.

import { fail } from "./envelope";
import { clientIp, limitKey } from "./rate-limit";
import { roleHas, type Permission } from "./staff-permissions";
import { getSession, isWrite, originAllowed, readSessionCookie } from "./staff-session";

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
  const denied = await check(request, requestId, permission);
  if (denied && !ip) limitKey(request, "admin", "unknown", requestId);
  return denied;
}

async function check(request: Request, requestId: string, permission: Permission): Promise<Response | null> {
  // Break-glass token path: only when the header is sent (unchanged behaviour).
  if (request.headers.has("x-admin-token")) return checkToken(request, requestId);

  if (readSessionCookie(request)) {
    let session;
    try {
      session = await getSession(request);
    } catch {
      return fail({ code: "dependency_unavailable", message: "Staff session store is unavailable.", requestId });
    }
    if (!session) {
      return fail({ code: "unauthenticated", message: "Your session has ended. Please sign in again.", requestId });
    }
    if (isWrite(request) && !originAllowed(request)) {
      return fail({ code: "forbidden", message: "Request origin is not allowed.", requestId });
    }
    if (!roleHas(session.user.role, permission)) {
      return fail({ code: "forbidden", message: "Your role does not allow this action.", requestId });
    }
    return null;
  }

  // Neither a session nor a token header: the same answers as before.
  return checkToken(request, requestId);
}

function checkToken(request: Request, requestId: string): Response | null {
  const token = configuredToken();
  if (!token) {
    return fail({
      code: "forbidden",
      message: "Admin operations are disabled: no USAM_ADMIN_TOKEN is configured.",
      requestId,
    });
  }
  const provided = request.headers.get("x-admin-token") ?? "";
  if (!timingSafeEqual(provided, token)) {
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
