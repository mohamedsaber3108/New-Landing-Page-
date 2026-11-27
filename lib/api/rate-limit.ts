// Per-IP fixed-window rate limits for admin and public POST routes (D-06).
//
// shortcut: counters live in this process's memory only. The site runs as one
// `wrangler dev --local` (Miniflare) process behind nginx, so one process sees
// every request. A restart clears the counters, and several processes or
// isolates would each count on their own. Move to a shared store (D1 / KV /
// Durable Object) before running more than one process.

import { fail } from "./envelope";

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  admin: { limit: 60, windowMs: 60_000 },
  leads: { limit: 10, windowMs: 10 * 60_000 },
  privacyRequests: { limit: 5, windowMs: 10 * 60_000 },
  feedback: { limit: 30, windowMs: 10 * 60_000 },
  // Staff sign-in (L-A1a), per IP; on top of the per-account lockout.
  staffLogin: { limit: 10, windowMs: 15 * 60_000 },
  // Failed sign-ins per staff account + IP pair (lib/api/staff-lockout.ts).
  staffLoginPair: { limit: 5, windowMs: 15 * 60_000 },
} satisfies Record<string, RateLimitRule>;

export type LimitName = keyof typeof RATE_LIMITS;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
export const MAX_KEYS = 10_000;

/** Test hook: forget all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Test hook: number of live keys. */
export function rateLimitKeyCount(): number {
  return buckets.size;
}

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

/** IPv6 addresses are grouped by their /64 prefix, so one host cannot rotate addresses. */
function normalizeIp(raw: string): string {
  const ip = raw.trim().toLowerCase();
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = ip.includes("::")
    ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t]
    : h;
  return `${groups.slice(0, 4).map((g) => g || "0").join(":")}::/64`;
}

/**
 * Client IP, or null when no trusted source is present.
 * Order:
 *  1. CF-Connecting-IP, ONLY when USAM_TRUST_CF_CONNECTING_IP=1 (set it only
 *     if the origin accepts traffic from Cloudflare alone; otherwise the
 *     header is client-controlled).
 *  2. X-Real-IP, which nginx overwrites (`proxy_set_header X-Real-IP $remote_addr;`).
 *  3. The LAST X-Forwarded-For entry (added by nginx when it appends; earlier
 *     entries are client-controlled).
 */
export function clientIp(request: Request): string | null {
  if (env().USAM_TRUST_CF_CONNECTING_IP === "1") {
    const cf = request.headers.get("cf-connecting-ip")?.trim();
    if (cf) return normalizeIp(cf);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return normalizeIp(real);
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last) return normalizeIp(last);
  }
  return null;
}

/** Keep the map bounded: drop expired buckets, then the oldest ones. Never clear all. */
function prune(now: number): void {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  // shortcut: linear scan at the cap; fine for one process, revisit with a shared store.
  const target = Math.floor(MAX_KEYS * 0.9);
  for (const key of buckets.keys()) {
    if (buckets.size <= target) break;
    buckets.delete(key); // Map order = insertion order, so these are the oldest windows.
  }
}

/** Plain wait-time message in Arabic or English. */
export function rateLimitMessage(seconds: number, locale: "en" | "ar"): string {
  if (locale === "ar") {
    return `طلبات كثيرة جدًا. انتظر ${seconds} ثانية ثم حاول مرة أخرى.`;
  }
  return `Too many requests. Please wait ${seconds} seconds and try again.`;
}

/** Locale for the message: X-USAM-Locale header (sent by the forms), else Accept-Language. */
function requestLocale(request: Request): "en" | "ar" {
  const explicit = request.headers.get("x-usam-locale");
  if (explicit === "ar" || explicit === "en") return explicit;
  return /^ar\b/i.test(request.headers.get("accept-language") ?? "") ? "ar" : "en";
}

function liveBucket(key: string, rule: RateLimitRule, now: number): Bucket {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.delete(key); // re-insert at the end so eviction order stays oldest-first
    prune(now);
    bucket = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, bucket);
  }
  return bucket;
}

function tooMany(request: Request, bucket: Bucket, now: number, requestId: string): Response {
  const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return fail({
    code: "rate_limited",
    message: rateLimitMessage(seconds, requestLocale(request)),
    requestId,
    headers: { "Retry-After": String(seconds) },
  });
}

/**
 * Count this request against `name` for `key`. With `count: false` it only
 * checks whether the key is already blocked (used for admin requests with no
 * IP, where only failed token checks are counted).
 */
export function limitKey(
  request: Request,
  name: LimitName,
  key: string,
  requestId: string,
  opts: { count?: boolean } = {},
): Response | null {
  const rule = RATE_LIMITS[name];
  const now = Date.now();
  const bucket = liveBucket(`${name}:${key}`, rule, now);
  if (opts.count === false) {
    return bucket.count >= rule.limit ? tooMany(request, bucket, now, requestId) : null;
  }
  bucket.count += 1;
  return bucket.count <= rule.limit ? null : tooMany(request, bucket, now, requestId);
}

/**
 * Public routes: count this request for the caller's IP. Returns null when
 * allowed, or a ready 429 Response (with Retry-After). With no usable IP the
 * request is NOT limited (fail open): a missing proxy header must never turn
 * the per-IP limit into one site-wide cap.
 */
export function rateLimit(request: Request, name: LimitName, requestId: string): Response | null {
  const ip = clientIp(request);
  if (!ip) {
    warnNoIpOnce();
    return null;
  }
  return limitKey(request, name, ip, requestId);
}

let warned = false;
function warnNoIpOnce(): void {
  if (warned) return;
  warned = true;
  console.warn("[rate-limit] no client IP header (X-Real-IP / X-Forwarded-For); public limits are off. Check nginx proxy_set_header.");
}
