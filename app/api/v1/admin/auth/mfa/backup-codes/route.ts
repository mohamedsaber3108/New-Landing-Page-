// POST /api/v1/admin/auth/mfa/backup-codes — replace the backup codes (L-A1b).
// Needs a step-up MFA check within 5 min. See lib/api/staff-mfa-flow.ts.
import { newRequestId } from "@/lib/api/envelope";
import { mfaBackupCodes } from "@/lib/api/staff-mfa-flow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return mfaBackupCodes(request, newRequestId());
}
