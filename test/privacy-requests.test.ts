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

const userRef: { current: null | { userId: string } } = { current: null };
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => userRef.current }));

import {
  createPrivacyRequest,
  listPrivacyRequests,
  updatePrivacyRequest,
} from "@/lib/api/privacy-requests";

function reset() {
  store.tables = {
    enquiries: [],
    idempotency_keys: [],
    outbox_events: [],
    consent_events: [],
    policy_publications: [],
    privacy_requests: [],
  };
  userRef.current = null;
}

const base = {
  requestType: "deletion" as const,
  name: "Data Subject",
  email: "subject@example.org",
  locale: "en" as const,
  message: "please delete my enquiry data",
};

describe("createPrivacyRequest", () => {
  beforeEach(reset);

  it("stores the request with a receipt reference and received/unverified state", async () => {
    const res = await createPrivacyRequest({ input: base });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^PRQ-/);
    expect(res.body.status).toBe("received");

    const row = store.tables.privacy_requests[0];
    expect(row.status).toBe("received");
    expect(row.identityVerified).toBe(false); // fulfilment is gated until verified
    // An outbox event notifies staff through the same durable channel as leads.
    expect(store.tables.outbox_events.some((e) => e.eventType === "privacy_request.created")).toBe(true);
  });

  it("is idempotent: the same Idempotency-Key does not create a duplicate", async () => {
    const first = await createPrivacyRequest({ input: base, idempotencyKey: "prq-dupe-1" });
    const second = await createPrivacyRequest({ input: base, idempotencyKey: "prq-dupe-1" });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.body.reference).toBe(first.body.reference); // replayed
    }
    expect(store.tables.privacy_requests).toHaveLength(1); // not duplicated
  });

  it("rejects a reused key with a different body (409 conflict)", async () => {
    await createPrivacyRequest({ input: base, idempotencyKey: "prq-k2" });
    const conflict = await createPrivacyRequest({
      input: { ...base, email: "different@example.org" },
      idempotencyKey: "prq-k2",
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.status).toBe(409);
  });
});

describe("updatePrivacyRequest — state machine + fulfilment gate", () => {
  beforeEach(reset);

  async function seed(requestType = "deletion") {
    const res = await createPrivacyRequest({ input: { ...base, requestType: requestType as "deletion" } });
    if (!res.ok) throw new Error("seed failed");
    return res.body.reference;
  }

  it("rejects an invalid status transition (received → completed)", async () => {
    const ref = await seed();
    const res = await updatePrivacyRequest({ reference: ref, status: "completed" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.error.code).toBe("conflict");
    }
    // Row stays received.
    expect(store.tables.privacy_requests[0].status).toBe("received");
  });

  it("blocks a deletion from reaching completion while identity is unverified", async () => {
    const ref = await seed("deletion");
    // Advance legally to in_review first.
    expect((await updatePrivacyRequest({ reference: ref, status: "in_review" })).ok).toBe(true);
    // Attempt to complete WITHOUT verifying identity → blocked.
    const res = await updatePrivacyRequest({ reference: ref, status: "completed" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(422);
      expect(res.error.code).toBe("validation_failed");
    }
    expect(store.tables.privacy_requests[0].status).toBe("in_review");
  });

  it("allows completion once identity is verified", async () => {
    const ref = await seed("deletion");
    expect((await updatePrivacyRequest({ reference: ref, status: "in_review" })).ok).toBe(true);
    expect((await updatePrivacyRequest({ reference: ref, identityVerified: true })).ok).toBe(true);
    const res = await updatePrivacyRequest({ reference: ref, status: "completed" });
    expect(res.ok).toBe(true);
    expect(store.tables.privacy_requests[0].status).toBe("completed");
  });

  it("cannot transition out of a terminal state", async () => {
    const ref = await seed("question");
    // question is non-sensitive; move it to in_review then rejected (terminal).
    await updatePrivacyRequest({ reference: ref, status: "in_review" });
    await updatePrivacyRequest({ reference: ref, status: "rejected" });
    const res = await updatePrivacyRequest({ reference: ref, status: "in_review" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });
});

describe("listPrivacyRequests", () => {
  beforeEach(reset);

  it("returns stored requests for the staff queue", async () => {
    await createPrivacyRequest({ input: base });
    const res = await listPrivacyRequests({ limit: 50 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.requests.length).toBe(1);
  });
});
