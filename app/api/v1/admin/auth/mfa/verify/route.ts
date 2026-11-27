// POST /api/v1/admin/auth/mfa/verify — confirm MFA set-up with the first code
// (L-A1b); returns 10 backup codes once. See lib/api/staff-mfa-flow.ts.
import { newRequestId } from "@/lib/api/envelope";
import { mfaVerify } from "@/lib/api/staff-mfa-flow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return mfaVerify(request, newRequestId());
}
