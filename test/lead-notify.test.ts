// Lead notification channel (D-07, L-A4a, owner default OD-05 A): one webhook
// message per new enquiry and per new privacy request, holding only id, type
// and a fixed note. A failing webhook is retried and stays visible.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  lte: (col: unknown, value: unknown) => ({ kind: "lte", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));

const store = new FakeStore();
vi.mock("@/db", () => ({ getDb: () => store }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import { createLead } from "@/lib/api/leads";
import { createPrivacyRequest } from "@/lib/api/privacy-requests";
import { processOutboxBatch, resolveChannel } from "@/lib/api/outbox-worker";

/** Move the clock forward past any backoff or lease. */
function later(ms = 11 * 60_000) {
  vi.setSystemTime(new Date(Date.now() + ms));
}

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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    delete ENV.USAM_LEAD_NOTIFY_WEBHOOK;
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

    // Before the backoff ends nothing is claimed.
    expect((await processOutboxBatch()).claimed).toBe(0);
    expect(run.totals).toEqual({ pending: 1, deadLetter: 0 });

    // Backoff passed and the webhook is back: the same event is delivered.
    later();
    stubFetch(async () => new Response("ok", { status: 200 }));
    const retry = await processOutboxBatch();
    expect(retry).toMatchObject({ claimed: 1, delivered: 1 });
    expect(store.tables.outbox_events[0].status).toBe("delivered");
    expect(sent).toHaveLength(2); // one failed try + one success, same event
  });

  it("a throwing webhook (dead address) ends in dead_letter after the max attempts; the URL never lands in lastError", async () => {
    stubFetch(async () => {
      throw new TypeError(`fetch failed: connect ECONNREFUSED ${HOOK}`);
    });
    await newPrivacyRequest();

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await processOutboxBatch());
      later();
    }
    expect(results.slice(0, 4).every((r) => r.failed === 1)).toBe(true);
    expect(results[4].deadLettered).toBe(1);
    expect(results[4].totals).toEqual({ pending: 0, deadLetter: 1 });

    const event = store.tables.outbox_events.find((e) => e.eventType === "privacy_request.created")!;
    expect(event.status).toBe("dead_letter");
    expect(event.attempts).toBe(5);
    expect(event.lastError).toBe("delivery failed (TypeError)");
    expect(JSON.stringify(store.tables.outbox_events)).not.toContain("hooks.example.test");
    expect((await processOutboxBatch()).claimed).toBe(0); // no endless retry
  });

  it("a stale 'delivering' row (worker crashed mid-send) is picked up after the lease", async () => {
    stubFetch(async () => new Response("ok", { status: 200 }));
    await newLead();
    const event = store.tables.outbox_events[0];
    // Simulate a crash right after the claim: status delivering, lease 10 min ahead.
    event.status = "delivering";
    event.nextAttemptAt = new Date(Date.now() + 10 * 60_000).toISOString();

    expect((await processOutboxBatch()).claimed).toBe(0); // lease still running
    later();
    expect(await processOutboxBatch()).toMatchObject({ claimed: 1, delivered: 1 });
    expect(event.status).toBe("delivered");
  });

  it("overlapping runs: an event already claimed by another run is skipped (no duplicate send)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    stubFetch(async () => {
      await gate;
      return new Response("ok", { status: 200 });
    });
    await newLead();
    const runA = processOutboxBatch();
    const runB = processOutboxBatch();
    release();
    const [a, b] = await Promise.all([runA, runB]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("a non-https webhook URL is ignored (treated as not configured)", async () => {
    ENV.USAM_LEAD_NOTIFY_WEBHOOK = "http://hooks.example.test/ops";
    stubFetch(async () => new Response("ok"));
    await newLead();
    expect(resolveChannel().kind).toBe("none");
    const run = await processOutboxBatch();
    expect(run.status).toBe("disabled");
    expect(run.note).toContain("https");
    expect(sent).toHaveLength(0);
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
