// GET /api/v1/content/pages/:slug?locale= (handoff C01) — published page sections.
import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { publicPage, type Locale } from "@/lib/api/content";

function readLocale(url: URL): Locale {
  return url.searchParams.get("locale") === "ar" ? "ar" : "en";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestId = newRequestId();
  const { slug } = await params;
  const locale = readLocale(new URL(request.url));

  const page = publicPage(slug, locale);
  if (!page) {
    return fail({ code: "not_found", message: `No published page for "${slug}".`, requestId });
  }
  return ok(page, { requestId });
}
