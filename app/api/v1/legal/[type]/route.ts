// GET /api/v1/legal/:type?locale= (handoff C08) — PROVISIONAL legal copy.
// The response marks `approval: "provisional"`; exposing it via API does not
// make it an approved policy.
import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { LEGAL_TYPES, publicLegal, type LegalType, type Locale } from "@/lib/api/content";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const requestId = newRequestId();
  const { type } = await params;
  const locale: Locale = new URL(request.url).searchParams.get("locale") === "ar" ? "ar" : "en";

  if (!(LEGAL_TYPES as readonly string[]).includes(type)) {
    return fail({
      code: "not_found",
      message: `Unknown legal document type "${type}".`,
      requestId,
    });
  }
  return ok(publicLegal(type as LegalType, locale), { requestId });
}
