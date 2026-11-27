// POST /api/v1/admin/auth/mfa/setup — start MFA set-up (L-A1b): returns the
// otpauth URI and secret once. Needs a session. See lib/api/staff-mfa-flow.ts.
import { newRequestId } from "@/lib/api/envelope";
import { mfaSetup } from "@/lib/api/staff-mfa-flow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return mfaSetup(request, newRequestId());
}
