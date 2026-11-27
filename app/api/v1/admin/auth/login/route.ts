// POST /api/v1/admin/auth/login — staff sign-in (L-A1a). Public by nature:
// it is the way in. Rate limited, lockout, Origin check: see lib/api/staff-login.ts.
import { newRequestId } from "@/lib/api/envelope";
import { login } from "@/lib/api/staff-login";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return login(request, newRequestId());
}
