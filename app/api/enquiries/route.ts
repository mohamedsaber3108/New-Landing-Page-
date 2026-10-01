// Backward-compatible alias for the canonical POST/GET /api/v1/leads.
//
// This path predates the v1 contract. Existing clients that POST to
// /api/enquiries keep working: the request is handled in-process by the same
// `createLead` / `listOwnLeads` core (NO HTTP redirect, so POST bodies are not
// lost), and the response is shaped to stay compatible with the original
// `{ enquiry }` / `{ error }` / `{ errors }` format.
//
// New clients should use /api/v1/leads directly.

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { createLead, createLeadSchema, flattenFieldErrors, listOwnLeads } from "@/lib/api/leads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  // Map the legacy field shape onto the canonical schema. The original route
  // accepted `kind` already; we also accept `category` as an alias and tolerate
  // the original shorter message/name minimums by letting the schema validate.
  const legacy = (raw ?? {}) as Record<string, unknown>;
  const candidate = {
    name: legacy.name,
    email: legacy.email,
    kind: legacy.kind ?? legacy.category,
    product: legacy.product ?? undefined,
    organization: legacy.organization ?? undefined,
    locale: legacy.locale,
    message: legacy.message,
    marketingOptIn: legacy.marketingOptIn,
  };

  const parsed = createLeadSchema.safeParse(candidate);
  if (!parsed.success) {
    // Preserve the original flat `errors: string[]` shape for old clients.
    const fieldErrors = flattenFieldErrors(parsed.error);
    const errors = Object.entries(fieldErrors).flatMap(([field, messages]) =>
      messages.map((m) => (field === "_" ? m : `${field}: ${m}`)),
    );
    return Response.json({ errors }, { status: 400 });
  }

  const idempotencyKey =
    request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");

  const result = await createLead({ input: parsed.data, idempotencyKey });

  if (!result.ok) {
    const status = result.error.code === "validation_failed" ? 400 : result.status;
    return Response.json({ error: result.error.message }, { status });
  }

  // Legacy-compatible success: expose an `enquiry` object (now including the new
  // public reference) alongside the canonical fields.
  const user = await getChatGPTUser().catch(() => null);
  return Response.json(
    {
      enquiry: {
        reference: result.body.reference,
        status: result.body.status,
        userId: user?.userId ?? null,
      },
      reference: result.body.reference,
      notificationStatus: result.body.notificationStatus,
    },
    { status: result.status },
  );
}

export async function GET() {
  const result = await listOwnLeads();
  if (!result.ok) {
    return Response.json({ error: result.error.message }, { status: result.status });
  }
  // Original route returned `{ enquiries: rows }`.
  return Response.json({ enquiries: result.leads });
}
