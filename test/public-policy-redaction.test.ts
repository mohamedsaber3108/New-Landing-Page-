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

  it("redacts a DRAFT policy to a neutral notice (no body, no placeholders, no version)", async () => {
    const view = await publicPolicyView("privacy", "en");
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.approval).toBe("draft");
    expect(view.version).toBe("");
    // Exactly one neutral status section; no draft body text.
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0].id).toBe("status");
    const blob = JSON.stringify(view);
    // No internal placeholders leak publicly.
    expect(blob).not.toContain("REQUIRES LEGAL REVIEW");
    expect(blob).not.toContain("REQUIRES CONFIGURATION");
    // No baseline draft body phrases leak (sample from the privacy baseline).
    expect(blob).not.toContain("Enquiry data");
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
    expect(view.approval).toBe("published");
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
    expect(view?.approval).toBe("draft"); // not consistently published
    expect(view?.sections[0].id).toBe("status");
  });
});
