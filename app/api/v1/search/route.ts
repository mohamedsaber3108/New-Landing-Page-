// GET /api/v1/search?q=&product=&audience=&cursor=&limit= (handoff C05)
//
// Public capability/product search over published content only. Deterministic
// cursor pagination; filter fields are allowlisted. No private records are ever
// searchable here.

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import {
  searchPublic,
  type Locale,
  type SearchAudience,
} from "@/lib/api/content";
import { products } from "@/data/products";

const AUDIENCES: SearchAudience[] = ["individual", "enterprise", "government", "talent", "kids"];
const PRODUCT_IDS = new Set(products.map((p) => p.id));

export async function GET(request: Request) {
  const requestId = newRequestId();
  const url = new URL(request.url);

  const q = url.searchParams.get("q") ?? "";
  const locale: Locale = url.searchParams.get("locale") === "ar" ? "ar" : "en";

  // Validate filters against allowlists; reject unknown values explicitly.
  const productParam = url.searchParams.get("product");
  if (productParam && !PRODUCT_IDS.has(productParam as never)) {
    return fail({ code: "validation_failed", message: `Unknown product filter "${productParam}".`, requestId });
  }
  const audienceParam = url.searchParams.get("audience");
  if (audienceParam && !AUDIENCES.includes(audienceParam as SearchAudience)) {
    return fail({ code: "validation_failed", message: `Unknown audience filter "${audienceParam}".`, requestId });
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  if (limitParam && (!Number.isFinite(limit) || limit < 1 || limit > 100)) {
    return fail({ code: "validation_failed", message: "limit must be between 1 and 100.", requestId });
  }

  const { items, nextCursor } = searchPublic({
    q,
    locale,
    product: productParam,
    audience: (audienceParam as SearchAudience | null) ?? null,
    cursor: url.searchParams.get("cursor"),
    limit,
  });

  return ok(
    { query: q, count: items.length, results: items },
    { requestId, nextCursor: nextCursor ?? undefined },
  );
}
