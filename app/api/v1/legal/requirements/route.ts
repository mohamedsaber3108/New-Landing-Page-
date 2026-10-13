// GET /api/v1/legal/requirements — tells the client which policies are
// APPROVED/PUBLISHED (and therefore whether Terms acceptance must be required
// and recorded) versus still draft (present a notice instead).
//
// The forms use this to decide whether to render a REQUIRED Terms checkbox
// (only when Terms are published) or a privacy-notice line. The server enforces
// the same thing independently in createLead, so this endpoint is for UX only
// and cannot be used to bypass a published requirement.

import { newRequestId, ok } from "@/lib/api/envelope";
import { getPolicyRequirement } from "@/lib/legal/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const [terms, privacy] = await Promise.all([
    getPolicyRequirement("terms"),
    getPolicyRequirement("privacy"),
  ]);
  return ok(
    {
      terms: {
        published: terms.required,
        version: terms.required ? terms.version : null,
      },
      privacy: {
        published: privacy.required,
        version: privacy.required ? privacy.version : null,
      },
    },
    { requestId },
  );
}
