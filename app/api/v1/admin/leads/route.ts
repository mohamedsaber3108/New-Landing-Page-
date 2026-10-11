// GET /api/v1/admin/leads — STAFF inbox for all enquiries.
//
// This closes a real gap: the owner-scoped GET /api/v1/leads only returns a
// signed-in user's OWN leads, so anonymous enterprise/government submissions
// (which have no owner) were unreachable by the team. This endpoint returns ALL
// enquiries with their structured fields, for triage and follow-up.
//
// Security: gated server-side by USAM_ADMIN_TOKEN via the shared authorizeAdmin
// helper. FAILS CLOSED when the token is unset (403). The token is supplied as
// an `x-admin-token` header from a trusted internal tool — never from the
// public website, a URL, or a frontend bundle.
//
// Query params: ?kind=enterprise|government|...  &limit=1..200  &beforeId=<id>
// (beforeId enables simple descending-id pagination).

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { authorizeAdmin } from "@/lib/api/admin-auth";
import { listAllLeads } from "@/lib/api/leads";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newRequestId();

  const denied = authorizeAdmin(request, requestId);
  if (denied) return denied;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const limitParam = url.searchParams.get("limit");
  const beforeIdParam = url.searchParams.get("beforeId");

  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
  if (limitParam && (!Number.isFinite(limit) || limit < 1 || limit > 200)) {
    return fail({ code: "validation_failed", message: "limit must be between 1 and 200.", requestId });
  }
  const beforeId = beforeIdParam ? Number.parseInt(beforeIdParam, 10) : null;
  if (beforeIdParam && !Number.isFinite(beforeId as number)) {
    return fail({ code: "validation_failed", message: "beforeId must be a number.", requestId });
  }

  const result = await listAllLeads({ kind, limit, beforeId });
  if (!result.ok) {
    return fail({ code: result.error.code, message: result.error.message, requestId });
  }

  const nextCursor =
    result.leads.length === limit ? String(result.leads[result.leads.length - 1]?.id ?? "") : undefined;

  return ok({ count: result.leads.length, leads: result.leads }, { requestId, nextCursor });
}
