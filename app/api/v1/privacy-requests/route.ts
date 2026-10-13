// POST /api/v1/privacy-requests — submit a privacy / data-subject request.
// Returns a receipt reference. Identity verification and fulfilment are handled
// by staff (admin endpoint); nothing is disclosed or deleted here.

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import {
  createPrivacyRequest,
  createPrivacyRequestSchema,
  flattenFieldErrors,
} from "@/lib/api/privacy-requests";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = newRequestId();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
  }

  const parsed = createPrivacyRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail({
      code: "validation_failed",
      message: "One or more fields are invalid.",
      fieldErrors: flattenFieldErrors(parsed.error),
      requestId,
    });
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");

  const result = await createPrivacyRequest({ input: parsed.data, idempotencyKey });
  if (!result.ok) {
    return fail({
      code: result.error.code,
      message: result.error.message,
      retryable: result.error.retryable,
      requestId,
    });
  }
  return ok(result.body, { status: result.status, requestId });
}
