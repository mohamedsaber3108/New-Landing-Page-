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

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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
// Collision-proof: each token mixes lower-case letters a reference (upper-case
// A-Z/2-9), a request id (hex) or an ISO timestamp can never contain, and the
// phone is matched only as its full string with "+" and spaces. Never assert on
// a short digit run: random references and timestamps can contain any digits
// (the old "4242" marker made CI run 46059923775 fail at random).
const NAME = "Zelda zzNAMEmarker7319";
const EMAIL = "zz.emailmarker7319@example.org"; // lower-case: the schema lower-cases emails
const PHONE = "+20 109 731 9731";
const MESSAGE = "zzMESSAGEmarker7319 please call me about our forty learners.";
const ORG = "zzORGmarker7319 Org";
const GOAL = "zzGOALmarker7319 I want to learn python for my job";
const MARKERS = [
  NAME, EMAIL, PHONE, MESSAGE, ORG, GOAL,
  // the unique tokens alone, so a partial echo (e.g. a trimmed message) is still caught
  "zzNAMEmarker7319", "zz.emailmarker7319", "zzMESSAGEmarker7319", "zzORGmarker7319", "zzGOALmarker7319",
];

const store = new FakeStore();
// The shared FakeStore has no content_feedback / guide_signals tables; this
// wrapper stores those two inserts so the feedback and guide routes reach
// their success path (and every DB-touching line) instead of a quick error.
const extraRows: unknown[] = [];
const good = new Proxy(store, {
  get(target, prop) {
    if (prop === "insert") {
      return (table: unknown) =>
        table === content_feedback || table === guideSignals
          ? { values: (v: unknown) => { extraRows.push(v); return Promise.resolve(); } }
          : target.insert(table);
    }
    const value = (target as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
  },
});
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
import { content_feedback, guideSignals } from "@/db/schema";

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
// [name, run, expected status with the working DB, expected status when every DB call throws]
// Asserting the status proves each workflow really ran to the point under test
// (success, or the DB error branch) instead of passing vacuously.
const WORKFLOWS: Array<[string, () => Promise<Response>, number, number]> = [
  // DB-error path: an unknown driver error is classified internal_error (500, generic text).
  ["leads: contact", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "general", message: MESSAGE, organization: ORG })), 201, 500],
  ["leads: enterprise", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "enterprise", organization: ORG, message: MESSAGE, structured: { phone: PHONE, role: NAME, country: ORG } })), 201, 500],
  ["leads: government", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "government", organization: ORG, message: MESSAGE, structured: { phone: PHONE, beneficiaries: MESSAGE } })), 201, 500],
  ["leads: invalid (validation error path)", () => leadsPOST(post("/api/v1/leads", { name: NAME, email: "not-an-email-zz.emailmarker7319", message: "short" })), 422, 422],
  ["/api/enquiries alias", () => enquiriesPOST(post("/api/enquiries", { name: NAME, email: EMAIL, category: "general", message: MESSAGE })), 201, 500],
  ["privacy request", () => privacyPOST(post("/api/v1/privacy-requests", { requestType: "access", name: NAME, email: EMAIL, message: MESSAGE, relatedReference: "USAM-LOGMRK" })), 201, 500],
  ["feedback", () => feedbackPOST(post("/api/v1/feedback", { contentId, rating: 1 })), 201, 500],
  ["feedback with smuggled text (rejected)", () => feedbackPOST(post("/api/v1/feedback", { contentId, rating: 1, note: MESSAGE })), 422, 422],
  ["consent", () => consentPOST(post("/api/v1/consent", { eventType: "cookie_choice", purpose: "site_cookies", detail: { analytics: false } })), 200, 200],
  ["guide resolve", () => guideResolvePOST(post("/api/v1/guide/resolve", { goal: GOAL })), 200, 200],
  ["guide signals", () => guideSignalsPOST(post("/api/guide-signals", { intent: "education", locale: "en" })), 201, 500],
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
    it.each(WORKFLOWS)(`%s (${db})`, async (name, run, okStatus, errorStatus) => {
      if (db !== "working DB") dbRef.current = leaky;
      const res = await run();
      const text = await res.clone().text();
      expect(res.status, `${name} / ${db}: ${text}`).toBe(db === "working DB" ? okStatus : errorStatus);
      expectNoLeak(`${name} / ${db}`);
      // Bonus: the response never echoes the submitted personal data either.
      for (const marker of MARKERS) expect(text, `${name} / ${db}: response contains "${marker}"`).not.toContain(marker);
    });
  }

  it("console is the only logger in app/ and lib/ (no other logging library or raw stdout/stderr writes)", () => {
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((n) => {
        const full = path.join(dir, n);
        return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|js|mjs)$/.test(n) ? [full] : [];
      });
    })(path.resolve(__dirname, "../app")).concat(
      (function walk(dir: string): string[] {
        return readdirSync(dir).flatMap((n) => {
          const full = path.join(dir, n);
          return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|js|mjs)$/.test(n) ? [full] : [];
        });
      })(path.resolve(__dirname, "../lib")),
    );
    expect(files.length).toBeGreaterThan(20);
    const other = /from\s+["'](pino|winston|bunyan|loglevel|log4js|debug|consola|signale)["']|process\.(stdout|stderr)\.write/;
    const hits = files.filter((f) => other.test(readFileSync(f, "utf8"))).map((f) => path.relative(path.resolve(__dirname, ".."), f));
    expect(hits).toEqual([]);
  });

  it("the spy really captures console output (control)", () => {
    console.error(`control ${EMAIL}`);
    expect(lines.some((l) => l.includes(EMAIL))).toBe(true);
  });

  it("outbox delivery: webhook ok, 500 and throwing (with the URL and row in the error) log nothing personal", async () => {
    await leadsPOST(post("/api/v1/leads", { name: NAME, email: EMAIL, kind: "general", message: MESSAGE, structured: { phone: PHONE } }));
    await privacyPOST(post("/api/v1/privacy-requests", { requestType: "access", name: NAME, email: EMAIL, message: MESSAGE }));
    expect(good.tables.outbox_events).toHaveLength(2);
    ENV.USAM_LEAD_NOTIFY_WEBHOOK = "https://hooks.example.test/ops";
    const runs: Array<[() => Promise<Response>, { claimed: number; delivered: number; failed: number }, string | null]> = [
      [async () => new Response("ok"), { claimed: 2, delivered: 2, failed: 0 }, null],
      [async () => new Response(`bad ${EMAIL}`, { status: 500 }), { claimed: 2, delivered: 0, failed: 2 }, "delivery responded 500"],
      [async () => { throw new TypeError(`fetch failed ${EMAIL} ${PHONE} https://hooks.example.test/ops`); }, { claimed: 2, delivered: 0, failed: 2 }, "delivery failed (TypeError)"],
    ];
    for (const [reply, counts, lastError] of runs) {
      vi.stubGlobal("fetch", vi.fn(reply));
      for (const e of good.tables.outbox_events) { e.status = "pending"; e.nextAttemptAt = "1970-01-01T00:00:00.000Z"; }
      const result = await processOutboxBatch();
      expect(result).toMatchObject({ status: "ran", channel: "webhook", ...counts });
      if (lastError) {
        // The exact safe text: no reply body, no error message, no URL.
        for (const e of good.tables.outbox_events) expect(e.lastError).toBe(lastError);
      }
    }
    expectNoLeak("outbox delivery");
  });
});
