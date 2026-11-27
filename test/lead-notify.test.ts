// Lead notification channel (D-07, L-A4a, owner default OD-05 A): one webhook
// message per new enquiry and per new privacy request, holding only id, type
// and a fixed note. A failing webhook is retried and stays visible.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  // The worker's "due" filter (lte nextAttemptAt) is treated as always true here;
  // the tests move nextAttemptAt themselves to simulate the backoff passing.
  lte: () => ({ kind: "and", parts: [] }),
  and: (...parts: unknown[]) => ({ kind: "and", parts: parts.filter((p) => (p as { kind?: string }).kind !== "and" || (p as { parts: unknown[] }).parts.length) }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));

const store = new FakeStore();
vi.mock("@/db", () => ({ getDb: () => store }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import { createLead } from "@/lib/api/leads";
import { createPrivacyRequest } from "@/lib/api/privacy-requests";
import { processOutboxBatch } from "@/lib/api/outbox-worker";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const HOOK = "https://hooks.example.test/ops";

const NAME = "Mona Example";
const EMAIL = "mona.private@example.org";
const PHONE = "+20 100 555 0199";
const MESSAGE = "Please call me about pricing for our team of forty.";

type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown>; raw: string };
let sent: Sent[] = [];

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const raw = String(init.body);
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(raw), raw });
    return impl();
  }));
}

async function newLead() {
  const res = await createLead({
    input: {
      name: NAME,
      email: EMAIL,
      kind: "general",
      product: "education",
      organization: "Example Org",
      locale: "en",
      message: MESSAGE,
      marketingOptIn: false,
      structured: { phone: PHONE },
    },
  });
  if (!res.ok) throw new Error("lead failed");
  return res.body.reference;
}

async function newPrivacyRequest() {
  const res = await createPrivacyRequest({
    input: { requestType: "access", name: NAME, email: EMAIL, locale: "en", message: MESSAGE },
  });
  if (!res.ok) throw new Error("privacy request failed");
  return res.body.reference;
}

function expectNoPersonalData(s: Sent) {
  expect(Object.keys(s.body).sort()).toEqual(["id", "text", "type"]);
  for (const secret of [NAME, EMAIL, PHONE, MESSAGE, "Example Org"]) {
    expect(s.raw).not.toContain(secret);
  }
  expect(s.raw).not.toMatch(/https?:\/\//); // link-free until the Lead Inbox exists
}

describe("lead notification webhook", () => {
  beforeEach(() => {
    store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [] };
    sent = [];
    ENV.USAM_LEAD_NOTIFY_WEBHOOK = HOOK;
  });
  afterEach(() => {
    delete ENV.USAM_LEAD_NOTIFY_WEBHOOK;
    vi.unstubAllGlobals();
  });

  it("sends exactly one message per enquiry and per privacy request, with no personal data", async () => {
    stubFetch(async () => new Response("ok", { status: 200 }));
    const leadRef = await newLead();
    const prqRef = await newPrivacyRequest();

    const first = await processOutboxBatch();
    expect(first).toMatchObject({ status: "ran", channel: "webhook", claimed: 2, delivered: 2, failed: 0 });
    // A second run sends nothing more: one message per record.
    const second = await processOutboxBatch();
    expect(second.claimed).toBe(0);

    expect(sent).toHaveLength(2);
    expect(sent.every((s) => s.url === HOOK)).toBe(true);
    const byType = Object.fromEntries(sent.map((s) => [s.body.type, s]));
    expect(byType["lead.created"].body.id).toBe(leadRef);
    expect(byType["privacy_request.created"].body.id).toBe(prqRef);
    for (const s of sent) {
      expectNoPersonalData(s);
      expect(s.headers["X-USAM-Event-Id"]).toBeTruthy();
    }
    expect(store.tables.outbox_events.every((e) => e.status === "delivered" && e.deliveredAt)).toBe(true);
  });

  it("a webhook answering 500 is retried and the failure stays visible in the outbox", async () => {
    stubFetch(async () => new Response("down", { status: 500 }));
    await newLead();

    const run = await processOutboxBatch();
    expect(run).toMatchObject({ claimed: 1, delivered: 0, failed: 1 });
    const event = store.tables.outbox_events[0];
    expect(event.status).toBe("pending");
    expect(event.attempts).toBe(1);
    expect(event.lastError).toBe("delivery responded 500");
    expect(event.nextAttemptAt as string > new Date().toISOString()).toBe(true); // backoff

    // Backoff passed and the webhook is back: the same event is delivered.
    stubFetch(async () => new Response("ok", { status: 200 }));
    const retry = await processOutboxBatch();
    expect(retry).toMatchObject({ claimed: 1, delivered: 1 });
    expect(store.tables.outbox_events[0].status).toBe("delivered");
    expect(sent).toHaveLength(2); // one failed try + one success, same event
  });

  it("a throwing webhook (dead address) ends in dead_letter after the max attempts, still visible", async () => {
    stubFetch(async () => {
      throw new Error("fetch failed");
    });
    await newPrivacyRequest();

    const results = [];
    for (let i = 0; i < 5; i++) results.push(await processOutboxBatch());
    expect(results.slice(0, 4).every((r) => r.failed === 1)).toBe(true);
    expect(results[4].deadLettered).toBe(1);

    const event = store.tables.outbox_events.find((e) => e.eventType === "privacy_request.created")!;
    expect(event.status).toBe("dead_letter");
    expect(event.attempts).toBe(5);
    expect(event.lastError).toBe("fetch failed");
    expect((await processOutboxBatch()).claimed).toBe(0); // no endless retry
  });

  it("with no webhook set, nothing is sent and events stay pending (as today)", async () => {
    delete ENV.USAM_LEAD_NOTIFY_WEBHOOK;
    stubFetch(async () => new Response("ok"));
    await newLead();
    const run = await processOutboxBatch();
    expect(run.status).toBe("disabled");
    expect(sent).toHaveLength(0);
    expect(store.tables.outbox_events[0].status).toBe("pending");
  });
});
