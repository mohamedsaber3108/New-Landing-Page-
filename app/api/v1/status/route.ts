// GET /api/v1/status (handoff C10/P19) — honest "not_monitored" state.
// No live monitoring exists; this never reports a green "operational" status.
import { newRequestId, ok } from "@/lib/api/envelope";
import { publicStatus } from "@/lib/api/content";

export async function GET() {
  const requestId = newRequestId();
  return ok(publicStatus(), { requestId });
}
