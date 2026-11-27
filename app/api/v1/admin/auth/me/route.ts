// GET /api/v1/admin/auth/me — the signed-in staff member and their permissions (L-A1a).
import { newRequestId } from "@/lib/api/envelope";
import { me } from "@/lib/api/staff-login";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return me(request, newRequestId());
}
