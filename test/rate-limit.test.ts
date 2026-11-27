// Per-IP rate limits (D-06): 429 at the set limit, plain AR/EN wait message,
// Retry-After header, and a fresh window after it expires.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));
vi.mock("@/db", () => ({ getDb: () => new FakeStore() }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import { RATE_LIMITS, clientIp, rateLimit, resetRateLimits } from "@/lib/api/rate-limit";
import { GET as consentGET } from "@/app/api/v1/admin/consent/route";
import { POST as leadsPOST } from "@/app/api/v1/leads/route";

function req(ip: string, headers: Record<string, string> = {}): Request {
  return new Request("https://x.test/api/v1/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `9.9.9.9, ${ip}`, ...headers },
    body: "{}",
  });
}

describe("rate limits", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("admin: 100 requests, 429 starts right after the limit, then works after the window", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 100; i++) statuses.push((await consentGET(req("1.1.1.1"))).status);
    const limit = RATE_LIMITS.admin.limit;
    // Under the limit the normal gate answers (403: no admin token configured).
    expect(statuses.slice(0, limit).every((s) => s !== 429)).toBe(true);
    expect(statuses.slice(limit).every((s) => s === 429)).toBe(true);

    vi.advanceTimersByTime(RATE_LIMITS.admin.windowMs + 1);
    expect((await consentGET(req("1.1.1.1"))).status).not.toBe(429);
  });

  it("public leads POST: 429 at the limit with Retry-After and a plain EN message", async () => {
    const limit = RATE_LIMITS.leads.limit;
    for (let i = 0; i < limit; i++) expect((await leadsPOST(req("2.2.2.2"))).status).not.toBe(429);
    const res = await leadsPOST(req("2.2.2.2"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe(String(RATE_LIMITS.leads.windowMs / 1000));
    const body = (await res.json()) as { error: { code: string; message: string; retryable: boolean } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.retryable).toBe(true);
    expect(body.error.message).toBe("Too many requests. Please wait 600 seconds and try again.");
    // Another IP is not affected.
    expect((await leadsPOST(req("3.3.3.3"))).status).not.toBe(429);
  });

  it("message is Arabic when the form sends X-USAM-Locale: ar, with the remaining wait", async () => {
    const limit = RATE_LIMITS.leads.limit;
    for (let i = 0; i < limit; i++) rateLimit(req("4.4.4.4"), "leads", "r");
    vi.advanceTimersByTime(100_000);
    const res = rateLimit(req("4.4.4.4", { "x-usam-locale": "ar" }), "leads", "r")!;
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("طلبات كثيرة جدًا. انتظر 500 ثانية ثم حاول مرة أخرى.");
  });

  it("uses the last X-Forwarded-For entry (added by nginx), not a client-sent first entry", () => {
    expect(clientIp(req("5.5.5.5"))).toBe("5.5.5.5");
    expect(clientIp(new Request("https://x.test", { headers: { "cf-connecting-ip": "6.6.6.6" } }))).toBe("6.6.6.6");
  });
});
