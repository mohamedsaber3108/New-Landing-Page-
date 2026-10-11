// POST /api/v1/admin/outbox/process — manually drain due outbox events.
//
// This is an operations endpoint. Until a real staff identity system exists, it
// is gated by a shared admin token (env USAM_ADMIN_TOKEN) and FAILS CLOSED when
// that token is not configured — a public URL must be denied by the server, not
// merely hidden. A future Cloudflare Cron/Queue consumer can call the same
// `processOutboxBatch()` without this HTTP gate.

import { newRequestId, ok } from "@/lib/api/envelope";
import { authorizeAdmin } from "@/lib/api/admin-auth";
import { processOutboxBatch } from "@/lib/api/outbox-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = newRequestId();

  const denied = authorizeAdmin(request, requestId);
  if (denied) return denied;

  const result = await processOutboxBatch({ limit: 50 });
  return ok(result, { requestId });
}
