// Staff privacy-request queue (ref 02 §27). GET lists requests; PATCH updates a
// request's workflow (status, identity verification, assignment, note).
//
// Gated server-side by USAM_ADMIN_TOKEN via authorizeAdmin — FAILS CLOSED when
// unset (403). Identity verification is a staff action recorded here; a request
// cannot be marked fulfilled without it being set, so no data is released on an
// email address alone.

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { authorizeAdmin } from "@/lib/api/admin-auth";
import {
  listPrivacyRequests,
  updatePrivacyRequest,
  updatePrivacyRequestSchema,
} from "@/lib/api/privacy-requests";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const denied = authorizeAdmin(request, requestId);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limitParam = url.searchParams.get("limit");
  const beforeIdParam = url.searchParams.get("beforeId");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
  if (limitParam && (!Number.isFinite(limit) || limit < 1 || limit > 200)) {
    return fail({ code: "validation_failed", message: "limit must be between 1 and 200.", requestId });
  }
  const beforeId = beforeIdParam ? Number.parseInt(beforeIdParam, 10) : null;

  const result = await listPrivacyRequests({ status, limit, beforeId });
  if (!result.ok) {
    return fail({ code: result.error.code, message: result.error.message, requestId });
  }
  const nextCursor =
    result.requests.length === limit
      ? String(result.requests[result.requests.length - 1]?.id ?? "")
      : undefined;
  return ok({ count: result.requests.length, requests: result.requests }, { requestId, nextCursor });
}

export async function PATCH(request: Request) {
  const requestId = newRequestId();
  const denied = authorizeAdmin(request, requestId);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
  }
  const parsed = updatePrivacyRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail({ code: "validation_failed", message: "Invalid update.", requestId });
  }

  const result = await updatePrivacyRequest(parsed.data);
  if (!result.ok) {
    return fail({ code: result.error.code, message: result.error.message, requestId });
  }
  if (!result.updated) {
    return fail({ code: "not_found", message: "No request with that reference.", requestId });
  }
  return ok({ updated: true }, { requestId });
}
