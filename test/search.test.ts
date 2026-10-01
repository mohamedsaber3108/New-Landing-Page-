import { describe, expect, it, vi } from "vitest";

// The content/search module imports @/db transitively only via sibling modules;
// searchPublic itself is pure over data/products. Mock drizzle-orm defensively
// so importing the schema (pulled in by content.ts) never needs the runtime.
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));

import { knownContentIds, searchPublic } from "@/lib/api/content";

describe("searchPublic", () => {
  it("returns products and capabilities matching a term", () => {
    const { items } = searchPublic({ q: "courses", locale: "en" });
    expect(items.length).toBeGreaterThan(0);
    // Education owns a "Courses" capability.
    expect(items.some((i) => /courses/i.test(i.title))).toBe(true);
  });

  it("ranks an exact product name above incidental matches", () => {
    const { items } = searchPublic({ q: "USAM Education", locale: "en" });
    expect(items[0]?.productId).toBe("education");
  });

  it("filters by product", () => {
    const { items } = searchPublic({ q: "", locale: "en", product: "kids" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.productId === "kids")).toBe(true);
  });

  it("filters by audience", () => {
    const { items } = searchPublic({ q: "", locale: "en", audience: "kids" });
    // Only the kids product is mapped to the kids audience.
    expect(items.every((i) => i.productId === "kids")).toBe(true);
  });

  it("paginates deterministically with a stable cursor", () => {
    const first = searchPublic({ q: "", locale: "en", limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();

    const second = searchPublic({ q: "", locale: "en", limit: 3, cursor: first.nextCursor });
    // No overlap between pages.
    const firstIds = new Set(first.items.map((i) => i.id));
    expect(second.items.every((i) => !firstIds.has(i.id))).toBe(true);
  });

  it("clamps limit to the 1..100 range", () => {
    const { items } = searchPublic({ q: "", locale: "en", limit: 9999 });
    expect(items.length).toBeLessThanOrEqual(100);
  });

  it("supports Arabic queries", () => {
    // "الدورات" (courses) is an Education Arabic feature.
    const { items } = searchPublic({ q: "الدورات", locale: "ar" });
    expect(items.some((i) => i.productId === "education")).toBe(true);
  });
});

describe("knownContentIds", () => {
  it("includes faq ids and page ids, used to validate feedback", () => {
    const ids = knownContentIds();
    expect(ids.has("faq-1")).toBe(true);
    expect(ids.has("page:contact")).toBe(true);
    expect(ids.has("faq-999")).toBe(false);
  });
});
