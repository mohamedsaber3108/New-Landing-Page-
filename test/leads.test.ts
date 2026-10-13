import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));

// Shared fake store the mocked getDb() hands out.
const store = new FakeStore();
vi.mock("@/db", () => ({ getDb: () => store }));

// Anonymous visitor by default; a test can override.
const userRef: { current: null | { userId: string } } = { current: null };
vi.mock("@/app/chatgpt-auth", () => ({
  getChatGPTUser: async () => userRef.current,
}));

import { createLead, listAllLeads, listOwnLeads, notificationChannelConfigured } from "@/lib/api/leads";

const base = {
  name: "Example Person",
  email: "person@example.org",
  kind: "general" as const,
  product: "education" as const,
  organization: undefined,
  locale: "en" as const,
  message: "A sufficiently long enquiry message.",
  marketingOptIn: false,
};

describe("createLead", () => {
  beforeEach(() => {
    store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [] };
    userRef.current = null;
  });

  it("persists the lead AND a lead.created outbox event in one write", async () => {
    const result = await createLead({ input: base });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(201);
    expect(result.body.reference).toMatch(/^USAM-/);

    expect(store.tables.enquiries).toHaveLength(1);
    expect(store.tables.outbox_events).toHaveLength(1);

    const lead = store.tables.enquiries[0];
    const event = store.tables.outbox_events[0];
    expect(lead.reference).toBe(result.body.reference);
    expect(lead.status).toBe("received");
    expect(event.eventType).toBe("lead.created");
    expect(event.status).toBe("pending");
    expect(event.aggregateRef).toBe(result.body.reference);
    // Outbox payload references the lead but does NOT duplicate the message body.
    expect(JSON.parse(event.payload as string)).not.toHaveProperty("message");
  });

  it("reports notificationStatus not_configured when no channel is set", async () => {
    expect(notificationChannelConfigured()).toBe(false);
    const result = await createLead({ input: base });
    if (!result.ok) throw new Error("expected success");
    expect(result.body.notificationStatus).toBe("not_configured");
    // The outbox event remains pending regardless — the lead is never lost.
    expect(store.tables.outbox_events[0].status).toBe("pending");
  });

  it("is idempotent: same key + same body returns the same reference once", async () => {
    const first = await createLead({ input: base, idempotencyKey: "key-1" });
    const second = await createLead({ input: base, idempotencyKey: "key-1" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.body.reference).toBe(first.body.reference);
    // Exactly one lead and one event despite two calls.
    expect(store.tables.enquiries).toHaveLength(1);
    expect(store.tables.outbox_events).toHaveLength(1);
  });

  it("concurrent duplicate submissions create exactly one lead", async () => {
    const calls = Array.from({ length: 6 }, () => createLead({ input: base, idempotencyKey: "dup" }));
    const results = await Promise.all(calls);
    const successes = results.filter((r) => r.ok);
    // Every caller gets a non-failing answer (success or a safe conflict); but
    // only one lead is actually persisted.
    expect(store.tables.enquiries).toHaveLength(1);
    expect(store.tables.outbox_events).toHaveLength(1);
    // At least the winner succeeded.
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });

  it("same key with a DIFFERENT body is rejected with 409 and writes nothing new", async () => {
    const first = await createLead({ input: base, idempotencyKey: "key-2" });
    expect(first.ok).toBe(true);
    const clash = await createLead({
      input: { ...base, message: "A completely different enquiry message here." },
      idempotencyKey: "key-2",
    });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.status).toBe(409);
    expect(store.tables.enquiries).toHaveLength(1);
  });

  it("associates the signed-in user id when present", async () => {
    userRef.current = { userId: "user_123" };
    const result = await createLead({ input: base });
    expect(result.ok).toBe(true);
    expect(store.tables.enquiries[0].userId).toBe("user_123");
  });

  it("Contact form regression: a lead with no `structured` block stores nulls for structured columns", async () => {
    const result = await createLead({ input: base });
    expect(result.ok).toBe(true);
    const lead = store.tables.enquiries[0];
    expect(lead.role).toBeNull();
    expect(lead.enquiryType).toBeNull();
    expect(lead.privacyAcknowledgedAt).toBeNull();
    expect(lead.budgetRange).toBeNull();
  });

  it("persists structured enterprise fields; privacy provenance is server-derived (null while draft)", async () => {
    const result = await createLead({
      input: {
        ...base,
        kind: "enterprise",
        organization: "Example Corp",
        structured: {
          role: "Head of People",
          phone: "+20 100 000 0000",
          country: "Egypt",
          enquiryType: "hiring",
          participantRange: "51-200",
          timeline: "1-3-months",
          budgetRange: "50k-250k",
          // Client sends a version, but privacy is NOT published, so the server
          // records neither a version nor an acknowledgement timestamp.
          privacyNoticeVersion: "2026-01",
          privacyAcknowledged: true,
        },
      },
    });
    expect(result.ok).toBe(true);
    const lead = store.tables.enquiries[0];
    expect(lead.kind).toBe("enterprise");
    expect(lead.organization).toBe("Example Corp");
    expect(lead.role).toBe("Head of People");
    expect(lead.country).toBe("Egypt");
    expect(lead.enquiryType).toBe("hiring");
    expect(lead.participantRange).toBe("51-200");
    expect(lead.timeline).toBe("1-3-months");
    expect(lead.budgetRange).toBe("50k-250k");
    // Privacy is still a draft → no client version is trusted, no ack timestamp.
    expect(lead.privacyNoticeVersion).toBeNull();
    expect(lead.privacyAcknowledgedAt).toBeNull();
  });

  it("persists structured government fields incl. beneficiaries", async () => {
    const result = await createLead({
      input: {
        ...base,
        kind: "government",
        organization: "Ministry of Example",
        structured: {
          enquiryType: "youth-program",
          beneficiaries: "Secondary school students in rural districts",
          timeline: "not-decided",
          privacyNoticeVersion: "2026-01",
          privacyAcknowledged: true,
        },
      },
    });
    expect(result.ok).toBe(true);
    const lead = store.tables.enquiries[0];
    expect(lead.kind).toBe("government");
    expect(lead.enquiryType).toBe("youth-program");
    expect(lead.beneficiaries).toContain("students");
    expect(lead.timeline).toBe("not-decided");
  });

  it("does NOT set a privacy timestamp when acknowledgement is absent/false", async () => {
    const result = await createLead({
      input: { ...base, kind: "enterprise", structured: { enquiryType: "partnership", privacyAcknowledged: false } },
    });
    expect(result.ok).toBe(true);
    expect(store.tables.enquiries[0].privacyAcknowledgedAt).toBeNull();
  });
});

describe("listOwnLeads", () => {
  beforeEach(() => {
    store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [] };
    userRef.current = null;
  });

  it("rejects anonymous callers with 401 and leaks no data", async () => {
    const res = await listOwnLeads();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("returns only the signed-in owner's own leads", async () => {
    userRef.current = { userId: "owner_1" };
    await createLead({ input: base });
    // A lead owned by someone else must not appear.
    store.tables.enquiries.push({
      id: 99,
      reference: "USAM-OTHER1",
      userId: "owner_2",
      name: "x",
      email: "x@y.z",
      kind: "general",
      product: null,
      locale: "en",
      message: "m",
      status: "received",
      createdAt: new Date().toISOString(),
    });

    const res = await listOwnLeads();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.leads).toHaveLength(1);
      expect(res.leads[0].reference).toMatch(/^USAM-/);
      expect(res.leads[0].reference).not.toBe("USAM-OTHER1");
    }
  });
});

describe("listAllLeads (staff inbox)", () => {
  beforeEach(() => {
    store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [] };
    userRef.current = null;
  });

  it("returns ALL leads including anonymous enterprise/government submissions", async () => {
    // Anonymous enterprise lead (no signed-in user) — the exact case the
    // owner-scoped endpoint could not surface.
    await createLead({
      input: { ...base, kind: "enterprise", organization: "Acme", structured: { enquiryType: "hiring", privacyAcknowledged: true } },
    });
    await createLead({
      input: { ...base, kind: "government", organization: "Ministry", structured: { enquiryType: "youth-program", privacyAcknowledged: true } },
    });

    const res = await listAllLeads({ limit: 50 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.leads.length).toBe(2);
      const kinds = res.leads.map((l) => l.kind).sort();
      expect(kinds).toEqual(["enterprise", "government"]);
      // Structured fields are present for staff triage.
      const ent = res.leads.find((l) => l.kind === "enterprise")!;
      expect(ent.organization).toBe("Acme");
      expect(ent.enquiryType).toBe("hiring");
    }
  });

  it("filters by kind", async () => {
    await createLead({ input: { ...base, kind: "enterprise", structured: { enquiryType: "hiring" } } });
    await createLead({ input: { ...base, kind: "government", structured: { enquiryType: "youth-program" } } });
    const res = await listAllLeads({ kind: "government", limit: 50 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.leads.length).toBe(1);
      expect(res.leads[0].kind).toBe("government");
    }
  });
});

describe("consent + terms acceptance (draft vs published)", () => {
  beforeEach(() => {
    store.tables = {
      enquiries: [],
      idempotency_keys: [],
      outbox_events: [],
      consent_events: [],
      policy_publications: [],
      privacy_requests: [],
    };
    userRef.current = null;
  });

  // Helper: mark a policy as consistently published in both locales at a shared
  // version, mirroring what publishPolicy writes.
  function publish(type: string, version: string) {
    for (const locale of ["en", "ar"]) {
      store.tables.policy_publications.push({
        id: store.tables.policy_publications.length + 1,
        policyType: type,
        locale,
        version,
        status: "current",
        materialChange: false,
        effectiveAt: "2026-03-01",
        content: "{}",
        publishedBy: "test",
        createdAt: new Date().toISOString(),
      });
    }
  }

  it("does NOT require Terms while they are draft; submission stays usable", async () => {
    const result = await createLead({
      input: { ...base, structured: { termsPresented: true, termsAccepted: false } },
    });
    expect(result.ok).toBe(true);
    expect(store.tables.enquiries).toHaveLength(1);
  });

  it("records privacy_notice_presented (not acceptance) while policies are draft", async () => {
    const result = await createLead({ input: { ...base, marketingOptIn: false } });
    expect(result.ok).toBe(true);
    const byType = store.tables.consent_events.map((e) => e.eventType).sort();
    expect(byType).toEqual(["marketing_consent", "privacy_notice_presented"]);
    expect(store.tables.consent_events.find((e) => e.eventType === "terms_acceptance")).toBeUndefined();
    expect(store.tables.consent_events.find((e) => e.eventType === "privacy_acknowledgement")).toBeUndefined();
  });

  it("REQUIRES Terms once published, rejecting an unaccepted submission (422, no write)", async () => {
    publish("terms", "2026-03-approved-1");
    const result = await createLead({
      input: { ...base, structured: { termsPresented: true, termsAccepted: false } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(result.error.code).toBe("validation_failed");
    expect(store.tables.enquiries).toHaveLength(0);
    expect(store.tables.consent_events).toHaveLength(0);
  });

  it("records terms_acceptance against the SERVER's published version when accepted", async () => {
    publish("terms", "2026-03-approved-1");
    publish("privacy", "2026-03-approved-1");
    const result = await createLead({
      input: {
        ...base,
        kind: "enterprise",
        marketingOptIn: true,
        structured: { termsPresented: true, termsAccepted: true, privacyAcknowledged: true },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byType = store.tables.consent_events.map((e) => e.eventType).sort();
    expect(byType).toEqual(["marketing_consent", "privacy_acknowledgement", "terms_acceptance"]);

    const terms = store.tables.consent_events.find((e) => e.eventType === "terms_acceptance")!;
    expect(terms.subjectRef).toBe(result.body.reference);
    expect(terms.status).toBe("granted");
    // Server-stamped version, NOT a client-supplied one.
    expect(terms.policyVersion).toBe("2026-03-approved-1");
  });

  it("records marketing as DENIED (explicit decision) when the optional box is unchecked", async () => {
    const result = await createLead({ input: { ...base, marketingOptIn: false } });
    expect(result.ok).toBe(true);
    const marketing = store.tables.consent_events.find((e) => e.eventType === "marketing_consent")!;
    expect(marketing).toBeDefined();
    expect(marketing.status).toBe("denied");
  });

  it("keeps the plain Contact submission (no structured block) working", async () => {
    const result = await createLead({ input: base });
    expect(result.ok).toBe(true);
    expect(store.tables.enquiries).toHaveLength(1);
  });
});
