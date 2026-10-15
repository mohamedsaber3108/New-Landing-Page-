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
    // A draft now shows READABLE informational content (not a single blank
    // status page) — several sections survive.
    expect(view.sections.length).toBeGreaterThan(3);
    const blob = JSON.stringify(view);
    // But NO internal review markers leak, in either language.
    expect(blob).not.toContain("FOR REVIEW");
    expect(blob).not.toContain("للمراجعة");
    expect(blob).not.toContain("REQUIRES LEGAL REVIEW");
    // Real informational content IS shown (sample phrases from the baseline).
    expect(blob).toContain("Egyptian limited liability company");
    expect(blob).toContain("discover the right USAM platform");
    // Commitment sections are flagged pending and carry the neutral note, not
    // an invented legal statement.
    const basis = view.sections.find((s) => s.id === "legal-basis");
    expect(basis?.pending).toBe(true);
    expect(basis?.body.join(" ")).toContain("being finalized");
    const retention = view.sections.find((s) => s.id === "retention-rights-pending");
    expect(retention?.pending).toBe(true);
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
    // Not consistently published (EN published, AR not) → treated as draft, and
    // no internal markers leak.
    expect(view?.approval).toBe("draft");
    expect(JSON.stringify(view)).not.toContain("FOR REVIEW");
  });
});
