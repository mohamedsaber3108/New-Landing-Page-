import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
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

import { createLead, listOwnLeads, notificationChannelConfigured } from "@/lib/api/leads";

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
    store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [] };
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
});

describe("listOwnLeads", () => {
  beforeEach(() => {
    store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [] };
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
