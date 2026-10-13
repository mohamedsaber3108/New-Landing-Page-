// GET /api/v1/legal/:type?locale= (handoff C08 + Legal Implementation Pack).
//
// Serves the central legal policies from lib/legal (privacy, terms, cookies,
// refunds, payments, ai-use, privacy-requests). The response carries an honest
// `approval` state: "draft" until a human publishes a reviewed version via the
// admin — exposing a draft via the API does not make it an approved policy.
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

  const doc = await publicLegal(type as LegalType, locale);
  if (!doc) {
    return fail({ code: "not_found", message: `No legal document for "${type}".`, requestId });
  }
  return ok(doc, { requestId });
}
