// Canonical lead capture endpoint (handoff L01 / section 14.1).
//
//   POST /api/v1/leads  -> durably capture an enquiry; idempotent via header
//   GET  /api/v1/leads  -> list the signed-in owner's own leads
//
// Response envelope: { data, meta } on success, { error } on failure.

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import {
  createLead,
  createLeadSchema,
  flattenFieldErrors,
  listOwnLeads,
} from "@/lib/api/leads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = newRequestId();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({
      code: "bad_request",
      message: "Request body must be valid JSON.",
      requestId,
    });
  }

  const parsed = createLeadSchema.safeParse(raw);
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

  const result = await createLead({ input: parsed.data, idempotencyKey });

  if (!result.ok) {
    return fail({
      code: result.error.code,
      message: result.error.message,
      fieldErrors: result.error.fieldErrors,
      retryable: result.error.retryable,
      requestId,
    });
  }

  return ok(result.body, { status: result.status, requestId });
}

export async function GET() {
  const requestId = newRequestId();
  const result = await listOwnLeads();
  if (!result.ok) {
    return fail({ code: result.error.code, message: result.error.message, requestId });
  }
  return ok({ leads: result.leads }, { requestId });
}
