// POST /api/v1/admin/outbox/process — manually drain due outbox events.
//
// This is an operations endpoint. Until a real staff identity system exists, it
// is gated by a shared admin token (env USAM_ADMIN_TOKEN) and FAILS CLOSED when
// that token is not configured — a public URL must be denied by the server, not
// merely hidden. A future Cloudflare Cron/Queue consumer can call the same
// `processOutboxBatch()` without this HTTP gate.

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { processOutboxBatch } from "@/lib/api/outbox-worker";

export const dynamic = "force-dynamic";

function adminToken(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return env.USAM_ADMIN_TOKEN;
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  const token = adminToken();
  if (!token) {
    // Fail closed: no token configured means no admin access is possible.
    return fail({
      code: "forbidden",
      message: "Admin operations are disabled: no USAM_ADMIN_TOKEN is configured.",
      requestId,
    });
  }

  const provided = request.headers.get("x-admin-token");
  if (provided !== token) {
    return fail({ code: "unauthenticated", message: "Invalid or missing admin token.", requestId });
  }

  const result = await processOutboxBatch({ limit: 50 });
  return ok(result, { requestId });
}
