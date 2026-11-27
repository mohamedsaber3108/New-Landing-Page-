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
} satisfies Record<string, RateLimitRule>;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

/** Test hook: forget all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Client IP. nginx appends the real peer address as the LAST
 * X-Forwarded-For entry, so we read that one (earlier entries are
 * client-controlled). Falls back to CF-Connecting-IP, then "unknown".
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last) return last;
  }
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function prune(now: number): void {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  // Still full (an address flood): drop everything rather than grow forever.
  if (buckets.size >= MAX_KEYS) buckets.clear();
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

/**
 * Count this request against `name` for the caller's IP. Returns null when
 * allowed, or a ready 429 Response (with Retry-After) when over the limit.
 */
export function rateLimit(
  request: Request,
  name: keyof typeof RATE_LIMITS,
  requestId: string,
): Response | null {
  const rule = RATE_LIMITS[name];
  const now = Date.now();
  const key = `${name}:${clientIp(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    prune(now);
    bucket = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count <= rule.limit) return null;

  const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return fail({
    code: "rate_limited",
    message: rateLimitMessage(seconds, requestLocale(request)),
    requestId,
    headers: { "Retry-After": String(seconds) },
  });
}
