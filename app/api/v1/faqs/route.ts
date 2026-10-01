// GET /api/v1/faqs?locale= (handoff C06) — published FAQ answers.
import { newRequestId, ok } from "@/lib/api/envelope";
import { publicFaqs, type Locale } from "@/lib/api/content";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const locale: Locale = new URL(request.url).searchParams.get("locale") === "ar" ? "ar" : "en";
  return ok({ faqs: publicFaqs(locale) }, { requestId });
}
