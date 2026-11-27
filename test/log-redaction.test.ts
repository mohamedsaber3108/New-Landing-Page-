// L-S2: no submitted email, phone, name or message text may reach a log line.
//
// Spies on console.log/info/warn/error/debug/trace while every public POST
// workflow runs (leads: contact, enterprise, government, plus the
// /api/enquiries alias; privacy request; feedback; consent; guide resolve;
// guide signals) and while the outbox delivers (webhook ok, 500, and throwing).
// Each workflow runs twice: with a working fake DB, and with a DB whose every
// call throws an error that QUOTES the submitted values (the worst case: a
// driver error echoing the row). The test fails if any marker string appears
// in any argument of any console call, including Error messages and stacks.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  lte: (col: unknown, value: unknown) => ({ kind: "lte", col, value }),
  gte: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  count: () => ({}),
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));

// Marker values: if any of these shows up in a log line, it is a leak.
const NAME = "Zelda LogMarkerName";
const EMAIL = "zelda.logmarker@example.org";
const PHONE = "+20 100 777 4242";
const MESSAGE = "LogMarkerMessage please call me about our forty learners.";
const ORG = "LogMarker Org";
const GOAL = "LogMarkerGoal I want to learn python for my job";
const MARKERS = [NAME, EMAIL, PHONE, MESSAGE, ORG, GOAL, "LogMarker", "logmarker", "4242"];

const good = new FakeStore();
/** A DB whose every operation throws an error that repeats the values it got. */
const leaky = {
  insert: () => ({ values: (v: unknown) => { throw new Error(`SQLITE_CONSTRAINT: failed row ${JSON.stringify(v)}`); } }),
  select: () => { throw new Error(`SQLITE_ERROR near select (${EMAIL})`); },
  update: () => { throw new Error(`SQLITE_ERROR update (${PHONE})`); },
  batch: (stmts: unknown) => { throw new Error(`SQLITE_ERROR batch ${JSON.stringify(stmts)}`); },
  transaction: () => { throw new Error(`SQLITE_ERROR tx (${MESSAGE})`); },
};
const dbRef: { current: unknown } = { current: good };
vi.mock("@/db", () => ({ getDb: () => dbRef.current }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import { POST as leadsPOST } from "@/app/api/v1/leads/route";
import { POST as enquiriesPOST } from "@/app/api/enquiries/route";
import { POST as privacyPOST } from "@/app/api/v1/privacy-requests/route";
import { POST as feedbackPOST } from "@/app/api/v1/feedback/route";
import { POST as consentPOST } from "@/app/api/v1/consent/route";
import { POST as guideResolvePOST } from "@/app/api/v1/guide/resolve/route";
import { POST as guideSignalsPOST } from "@/app/api/guide-signals/route";
import { processOutboxBatch } from "@/lib/api/outbox-worker";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { knownContentIds } from "@/lib/api/content";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;
let lines: string[] = [];
let ip = 0;

function stringify(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ""}\n${stringify(arg.cause)}`;
  if (typeof arg === "string") return arg;
  try { return JSON.stringify(arg) ?? String(arg); } catch { return String(arg); }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://x.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": `10.92.0.${++ip % 250}`, ...headers },
    body: JSON.stringify(body),
  });
}

const contentId = [...knownContentIds()][0];
const WORKFLOWS: Array<[string, () => Promise<unknown>]> = [
  ["leads: contact", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "general", message: MESSAGE, organization: ORG }))],
  ["leads: enterprise", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "enterprise", organization: ORG, message: MESSAGE, structured: { phone: PHONE, role: NAME, country: ORG } }))],
  ["leads: government", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "government", organization: ORG, message: MESSAGE, structured: { phone: PHONE, beneficiaries: MESSAGE } }))],
  ["leads: invalid (validation error path)", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: "not-an-email-logmarker", message: "short" }))],
  ["/api/enquiries alias", () => enquiriesPOST(post("/api/enquiries", { name: NAME, email: EMAIL, category: "general", message: MESSAGE }))],
  ["privacy request", () => privacyPOST(post("/api/v1/privacy-requests", { requestType: "access", name: NAME, email: EMAIL, message: MESSAGE, relatedReference: "USAM-LOGMRK" }))],
  ["feedback", () => feedbackPOST(post("/api/v1/feedback", { contentId, rating: 1 }))],
  ["feedback with smuggled text (rejected)", () => feedbackPOST(post("/api/v1/feedback", { contentId, rating: 1, note: MESSAGE }))],
  ["consent", () => consentPOST(post("/api/v1/consent", { eventType: "cookie_choice", purpose: "site_cookies", detail: { analytics: false } }))],
  ["guide resolve", () => guideResolvePOST(post("/api/v1/guide/resolve", { goal: GOAL }))],
  ["guide signals", () => guideSignalsPOST(post("/api/guide-signals", { intent: "education", locale: "en" }))],
];

beforeEach(() => {
  lines = [];
  for (const m of METHODS) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { lines.push(`[${m}] ${args.map(stringify).join(" ")}`); });
  }
  good.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [] };
  dbRef.current = good;
  resetRateLimits();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete ENV.USAM_LEAD_NOTIFY_WEBHOOK;
});

function expectNoLeak(label: string) {
  for (const line of lines) {
    for (const marker of MARKERS) expect(line, `${label}: log line contains "${marker}"`).not.toContain(marker);
  }
}

describe("no personal data in logs", () => {
  for (const db of ["working DB", "DB errors that quote the row"] as const) {
    it.each(WORKFLOWS.map(([name, run]) => [name, run] as const))(`%s (${db})`, async (name, run) => {
      if (db !== "working DB") dbRef.current = leaky;
      await run();
      expectNoLeak(`${name} / ${db}`);
    });
  }

  it("the spy really captures console output (control)", () => {
    console.error(`control ${EMAIL}`);
    expect(lines.some((l) => l.includes(EMAIL))).toBe(true);
  });

  it("outbox delivery: webhook ok, 500 and throwing (with the URL and row in the error) log nothing personal", async () => {
    await leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "general", message: MESSAGE, structured: { phone: PHONE } }));
    await privacyPOST(post("/api/v1/privacy-requests", { requestType: "access", name: NAME, email: EMAIL, message: MESSAGE }));
    ENV.USAM_LEAD_NOTIFY_WEBHOOK = "https://hooks.example.test/ops";
    for (const reply of [
      async () => new Response("ok"),
      async () => new Response(`bad ${EMAIL}`, { status: 500 }),
      async () => { throw new TypeError(`fetch failed ${EMAIL} ${PHONE}`); },
    ]) {
      vi.stubGlobal("fetch", vi.fn(reply));
      for (const e of good.tables.outbox_events) { e.status = "pending"; e.nextAttemptAt = "1970-01-01T00:00:00.000Z"; }
      await processOutboxBatch();
    }
    expectNoLeak("outbox delivery");
    // And the stored failure text has no personal data either.
    for (const e of good.tables.outbox_events) {
      for (const marker of MARKERS) expect(String(e.lastError ?? ""), `outbox lastError has "${marker}"`).not.toContain(marker);
    }
  });
});
