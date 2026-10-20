// Verifies the PUBLIC policy projection never exposes unapproved draft text or
// internal "[REQUIRES ...]" placeholders. Only a published (consistent EN+AR)
// release returns full text; a draft returns a neutral "being finalized" notice.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));

const store = new FakeStore();
vi.mock("@/db", () => ({ getDb: () => store }));

import { publicPolicyView } from "@/lib/legal/store";

function reset() {
  store.tables = {
    enquiries: [],
    idempotency_keys: [],
    outbox_events: [],
    consent_events: [],
    policy_publications: [],
    privacy_requests: [],
  };
}

function publish(type: string, version: string, content: Record<string, unknown>) {
  for (const locale of ["en", "ar"]) {
    store.tables.policy_publications.push({
      id: store.tables.policy_publications.length + 1,
      policyType: type,
      locale,
      version,
      status: "current",
      materialChange: false,
      effectiveAt: "2026-03-01",
      content: JSON.stringify({ ...content, type, version }),
      publishedBy: "test",
      createdAt: new Date().toISOString(),
    });
  }
}

describe("publicPolicyView redaction", () => {
  beforeEach(reset);

  it("shows the full policy as plain content with NO draft/review wording or markers", async () => {
    const view = await publicPolicyView("privacy", "en");
    expect(view).not.toBeNull();
    if (!view) return;
    // Not a published release: published:false, no public version/effective date.
    expect(view.published).toBe(false);
    expect(view.version).toBe("");
    expect(view.effectiveAt).toBeNull();
    // The internal lifecycle string is NOT exposed on the public projection.
    expect((view as Record<string, unknown>).approval).toBeUndefined();
    // Full readable content is shown — several sections survive.
    expect(view.sections.length).toBeGreaterThan(3);
    const blob = JSON.stringify(view);
    // NO internal review markers leak, in either language.
    expect(blob).not.toContain("[FOR REVIEW");
    expect(blob).not.toContain("[للمراجعة");
    expect(blob).not.toContain("REQUIRES");
    // NO public draft/review/"being finalized" status wording anywhere (EN + AR).
    expect(blob).not.toContain("being finalized");
    expect(blob).not.toContain("under review");
    expect(blob).not.toContain("working draft");
    expect(blob).not.toContain("قيد الإعداد");
    expect(blob).not.toContain("قيد المراجعة");
    expect(blob).not.toContain("مسودة");
    // The rewritten verified content IS shown.
    expect(blob).toContain("discover the right USAM platform");
    // The lawful-basis section was rewritten to real content; the old pending
    // placeholder section was removed.
    expect(view.sections.find((s) => s.id === "legal-basis")).toBeTruthy();
    expect(view.sections.find((s) => s.id === "retention-rights-pending")).toBeUndefined();
  });

  it("returns the FULL text once a consistent EN+AR release is published", async () => {
    publish("privacy", "2026-03-approved-1", {
      title: "Privacy Policy",
      scope: "Approved scope",
      appliesTo: "usamif.com",
      sections: [{ id: "s1", heading: "Approved section", body: ["Real approved body."] }],
    });
    const view = await publicPolicyView("privacy", "en");
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.published).toBe(true);
    expect(view.version).toBe("2026-03-approved-1");
    expect(view.sections.some((s) => s.id === "s1")).toBe(true);
  });

  it("keeps redacting when only ONE locale is published (version mismatch guard)", async () => {
    // Publish EN only — not a consistent release.
    store.tables.policy_publications.push({
      id: 1,
      policyType: "privacy",
      locale: "en",
      version: "2026-03-approved-1",
      status: "current",
      materialChange: false,
      effectiveAt: "2026-03-01",
      content: JSON.stringify({ type: "privacy", version: "2026-03-approved-1", sections: [{ id: "s1", heading: "x", body: ["y"] }] }),
      publishedBy: "test",
      createdAt: new Date().toISOString(),
    });
    const view = await publicPolicyView("privacy", "en");
    // Not consistently published (EN published, AR not) → not treated as a
    // public published release, and no internal markers leak.
    expect(view?.published).toBe(false);
    expect(JSON.stringify(view)).not.toContain("FOR REVIEW");
  });

  // Draft/review STATUS wording that describes the site or policy as unfinished.
  // (Deliberately NOT the bare word "review"/"للمراجعة", which legitimately
  // appears in "auditable record", "human-review controls" and "staff review".)
  const DRAFT_WORDING = [
    // Internal marker forms (must never reach public output).
    "[FOR REVIEW", "[للمراجعة", "[تتطلب", "REQUIRES LEGAL REVIEW", "REQUIRES CONFIGURATION",
    // English status-of-the-document wording.
    "being finalized", "under review", "working draft", "under development",
    "not yet effective", "pending approval", "subject to review", "not final",
    // Arabic status-of-the-document wording.
    "قيد الإعداد", "قيد المراجعة", "مسودة", "غير نهائي",
    "قيد الاعتماد", "نسخة تجريبية", "تحت المراجعة", "جارٍ الاستكمال",
  ];

  it("every policy, both locales, is free of draft/review wording and markers", async () => {
    const types = [
      "privacy", "terms", "cookies", "refunds", "payments", "ai-use", "privacy-requests",
    ] as const;
    for (const type of types) {
      for (const locale of ["en", "ar"] as const) {
        const view = await publicPolicyView(type, locale);
        expect(view, `${type}/${locale} view`).not.toBeNull();
        const blob = JSON.stringify(view);
        for (const term of DRAFT_WORDING) {
          expect(blob.includes(term), `${type}/${locale} must not contain "${term}"`).toBe(false);
        }
        // Full content is shown (not blanked).
        expect(view!.sections.length, `${type}/${locale} has sections`).toBeGreaterThan(0);
        // Internal lifecycle string is not exposed.
        expect((view as Record<string, unknown>).approval, `${type}/${locale} no approval field`).toBeUndefined();
      }
    }
  });
});
