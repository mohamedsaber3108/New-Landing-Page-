// proxy.ts: the matcher (checked with vinext's own matcher code) sends only
// page paths to the proxy, and the proxy appends Cookie to Vary and sets
// Cache-Control: private, no-store.

import { describe, expect, it, vi } from "vitest";
// Not in vinext's package exports, so imported by path (the real matcher code).
import { matchesMiddleware } from "../node_modules/vinext/dist/server/middleware-matcher.js";
import { config, proxy } from "@/proxy";

const match = (path: string) => matchesMiddleware(path, config.matcher, new Request(`http://x${path}`));

describe("proxy matcher", () => {
  it("runs on page paths", () => {
    for (const path of ["/", "/faq", "/for-enterprises", "/privacy-requests", "/contact"]) {
      expect(match(path), path).toBe(true);
    }
  });

  it("skips API routes, build assets and static files (so they are not no-store)", () => {
    for (const path of [
      "/api",
      "/api/v1/leads",
      "/_next/static/chunk.js",
      "/assets/app.css",
      "/brand/usam-logo.png",
      "/favicon.svg",
      "/robots.txt",
      "/sitemap.xml",
      "/fonts/x.woff2",
    ]) {
      expect(match(path), path).toBe(false);
    }
  });

  it("is accepted by vinext as safe (no fallback to every path)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    match("/favicon.svg");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("proxy headers", () => {
  it("appends Cookie to Vary and sets private, no-store", () => {
    const res = proxy();
    expect(res.headers.get("Vary")).toContain("Cookie");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
