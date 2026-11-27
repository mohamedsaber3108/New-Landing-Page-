// POST /api/v1/admin/auth/logout — end the staff session and clear the cookie (L-A1a).
import { newRequestId } from "@/lib/api/envelope";
import { logout } from "@/lib/api/staff-login";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return logout(request, newRequestId());
}
