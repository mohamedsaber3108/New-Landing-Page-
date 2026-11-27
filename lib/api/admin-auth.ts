// Shared server-side admin authorization for operations endpoints.
//
// Security model (interim, until a real staff identity system exists):
//  - A single shared secret in env `USAM_ADMIN_TOKEN` gates all /admin routes.
//  - FAIL CLOSED: if the token is not configured, every admin request is denied
//    (403). A public admin URL must be rejected by the server, never merely
//    hidden in the UI.
//  - The token is compared server-side only. It is NEVER sent to the browser,
//    embedded in frontend bundles, placed in URLs, or written to public files.
//    Staff supply it as an `x-admin-token` request header from a trusted tool
//    (e.g. curl / an internal admin client), not from the website UI.
//  - Token rule: random (e.g. `openssl rand -hex 32`), at least 32 characters,
//    rotated whenever staff with access change, and never pasted in chat,
//    tickets or the repo.
//  - Every admin request is rate limited per IP (see rate-limit.ts) before the
//    token is checked. With no client IP, only failed token checks count.
//
// Returns null when authorized; otherwise a ready-to-return error Response.

import { fail } from "./envelope";
import { clientIp, limitKey } from "./rate-limit";

function configuredToken(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return env.USAM_ADMIN_TOKEN;
}

export function adminConfigured(): boolean {
  return Boolean(configuredToken());
}

/**
 * Authorize an admin request. On failure returns an error Response to return
 * directly; on success returns null (proceed). Uses a constant-time-ish compare.
 */
export function authorizeAdmin(request: Request, requestId: string): Response | null {
  // Limit first, so token guessing is slowed even when the token is wrong.
  // With a client IP every request counts. With no IP all callers would share
  // one key, so there only FAILED checks count: an attacker cannot use up the
  // quota of an admin who sends the right token.
  const ip = clientIp(request);
  const limited = limitKey(request, "admin", ip ?? "unknown", requestId, { count: Boolean(ip) });
  if (limited) return limited;
  const denied = checkToken(request, requestId);
  if (denied && !ip) limitKey(request, "admin", "unknown", requestId);
  return denied;
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
