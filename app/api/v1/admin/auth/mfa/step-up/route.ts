// POST /api/v1/admin/auth/mfa/step-up — fresh MFA check for sensitive actions
// (L-A1b, ADMIN.md s.5); valid 5 min. See lib/api/staff-mfa-flow.ts.
import { newRequestId } from "@/lib/api/envelope";
import { mfaStepUp } from "@/lib/api/staff-mfa-flow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return mfaStepUp(request, newRequestId());
}
