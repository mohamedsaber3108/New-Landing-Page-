// POST /api/v1/admin/auth/login/mfa — second sign-in step (L-A1b): TOTP or
// backup code for the pending sign-in; creates the session. See lib/api/staff-mfa-flow.ts.
import { newRequestId } from "@/lib/api/envelope";
import { loginMfa } from "@/lib/api/staff-mfa-flow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return loginMfa(request, newRequestId());
}
