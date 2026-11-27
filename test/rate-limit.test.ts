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

import {
  MAX_KEYS,
  RATE_LIMITS,
  clientIp,
  rateLimit,
  rateLimitKeyCount,
  resetRateLimits,
} from "@/lib/api/rate-limit";
import { authorizeAdmin } from "@/lib/api/admin-auth";
import { GET as consentGET } from "@/app/api/v1/admin/consent/route";
import { POST as leadsPOST } from "@/app/api/v1/leads/route";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;

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

  it("IP order: X-Real-IP, then last X-Forwarded-For; CF-Connecting-IP only when trusted", () => {
    const h = (headers: Record<string, string>) => new Request("https://x.test", { headers });
    expect(clientIp(req("5.5.5.5"))).toBe("5.5.5.5");
    expect(clientIp(h({ "x-real-ip": "7.7.7.7", "x-forwarded-for": "8.8.8.8" }))).toBe("7.7.7.7");
    expect(clientIp(h({ "cf-connecting-ip": "6.6.6.6" }))).toBeNull();
    ENV.USAM_TRUST_CF_CONNECTING_IP = "1";
    try {
      expect(clientIp(h({ "cf-connecting-ip": "6.6.6.6", "x-real-ip": "7.7.7.7" }))).toBe("6.6.6.6");
    } finally {
      delete ENV.USAM_TRUST_CF_CONNECTING_IP;
    }
    // IPv6 is grouped by /64.
    expect(clientIp(h({ "x-real-ip": "2001:db8:1:2::abcd" }))).toBe(clientIp(h({ "x-real-ip": "2001:db8:1:2:ffff::1" })));
  });

  it("no IP headers: 50 leads POSTs get no 429 (public forms fail open, no shared bucket)", async () => {
    const noIp = () => new Request("https://x.test/api/v1/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    for (let i = 0; i < 50; i++) expect((await leadsPOST(noIp())).status).not.toBe(429);
  });

  it("public window resets: a leads POST works again after the window", async () => {
    for (let i = 0; i <= RATE_LIMITS.leads.limit; i++) await leadsPOST(req("2.2.2.9"));
    expect((await leadsPOST(req("2.2.2.9"))).status).toBe(429);
    vi.advanceTimersByTime(RATE_LIMITS.leads.windowMs + 1);
    expect((await leadsPOST(req("2.2.2.9"))).status).not.toBe(429);
  });

  it("admin with no IP: only wrong tokens count, so the right token still works", async () => {
    ENV.USAM_ADMIN_TOKEN = "t".repeat(40);
    try {
      const noIp = (token: string) => new Request("https://x.test/api/v1/admin/x", { headers: { "x-admin-token": token } });
      for (let i = 0; i < 200; i++) expect(await authorizeAdmin(noIp("t".repeat(40)), "r", "leads:view")).toBeNull();
      for (let i = 0; i < RATE_LIMITS.admin.limit; i++) expect((await authorizeAdmin(noIp("wrong"), "r", "leads:view"))!.status).toBe(401);
      expect((await authorizeAdmin(noIp("wrong"), "r", "leads:view"))!.status).toBe(429);
    } finally {
      delete ENV.USAM_ADMIN_TOKEN;
    }
  });

  it("at the key cap, old buckets are evicted, not all counters cleared", () => {
    const limit = RATE_LIMITS.leads.limit;
    for (let i = 0; i <= limit; i++) rateLimit(req("10.0.0.1"), "leads", "r");
    // Fill the map with many other recent keys (oldest first).
    for (let i = 0; i < MAX_KEYS; i++) rateLimit(req(`11.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`), "feedback", "r");
    expect(rateLimitKeyCount()).toBeLessThan(MAX_KEYS);
    // The newest keys survive with their counts.
    const newest = `11.${((MAX_KEYS - 1) >> 16) & 255}.${((MAX_KEYS - 1) >> 8) & 255}.${(MAX_KEYS - 1) & 255}`;
    for (let i = 0; i < RATE_LIMITS.feedback.limit - 1; i++) rateLimit(req(newest), "feedback", "r");
    expect(rateLimit(req(newest), "feedback", "r")!.status).toBe(429);
  });
});
