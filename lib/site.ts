// Canonical site origin, configurable via env for different environments.
// Defaults to the production main domain. Set USAM_SITE_URL to override
// (e.g. https://landing.usamif.com during staging).
export function siteUrl(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const raw = env.USAM_SITE_URL || "https://usamif.com";
  return raw.replace(/\/+$/, "");
}

/** Internal informational routes that belong in the public sitemap. */
export const SITEMAP_PATHS = [
  "/",
  "/about",
  "/ecosystem",
  "/explore",
  "/how-it-works",
  "/for-individuals",
  "/for-enterprises",
  "/government",
  "/for-talent",
  "/kids",
  "/pricing",
  "/contact",
  "/trust",
  "/faq",
  "/guide",
  "/privacy",
  "/terms",
  "/cookies",
  "/status",
] as const;
