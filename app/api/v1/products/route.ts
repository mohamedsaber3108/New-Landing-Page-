// GET /api/v1/products (handoff C02) — public product registry, no secrets.
import { newRequestId, ok } from "@/lib/api/envelope";
import { publicProducts } from "@/lib/api/content";

export async function GET() {
  const requestId = newRequestId();
  return ok({ products: publicProducts() }, { requestId });
}
