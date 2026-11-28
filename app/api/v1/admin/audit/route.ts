// GET /api/v1/admin/audit — read the admin audit log (L-A2), newest first.
// Permission audit:view (Super Admin, Admin; break-glass token too).
// Query: from, to (YYYY-MM-DD, UTC, inclusive), action, result, cursor, limit (1-100, default 50).
// Rows hold no personal text (lib/api/audit.ts), so they are returned as stored.
import { z } from "zod";
import { authorizeAdmin } from "@/lib/api/admin-auth";
import { AUDIT_ACTIONS, AUDIT_RESULTS, listAudit } from "@/lib/api/audit";
import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { ROUTE_PERMISSIONS } from "@/lib/api/staff-permissions";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  from: day.optional(),
  to: day.optional(),
  action: z.enum(AUDIT_ACTIONS as unknown as [string, ...string[]]).optional(),
  result: z.enum(AUDIT_RESULTS).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  const requestId = newRequestId();
  const denied = await authorizeAdmin(request, requestId, ROUTE_PERMISSIONS["GET /api/v1/admin/audit"]);
  if (denied) return denied;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return fail({ code: "validation_failed", message: "Invalid audit filters.", requestId });
  try {
    const { rows, nextCursor } = await listAudit(parsed.data);
    return ok({ entries: rows }, { requestId, nextCursor: nextCursor ? String(nextCursor) : undefined, headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail({ code: "dependency_unavailable", message: "Audit log is unavailable.", requestId });
  }
}
