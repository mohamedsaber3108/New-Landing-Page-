// Next 16 / vinext request proxy (formerly middleware).
//
// HTML pages depend on the usam-locale cookie (server-rendered <html lang dir>
// and page text), so no shared cache may store them or serve one visitor's
// language to another. vinext ignores a `Vary` from next.config headers()
// for these pages, so the headers are set here.
//
// The matcher below limits the proxy to page paths only: API routes, build
// assets and every file with an extension (svg, png, fonts, robots.txt,
// sitemap.xml, ...) never reach it, so they keep their own caching.

import { NextResponse } from "next/server";

export function proxy() {
  const response = NextResponse.next();
  // Append: vinext merges this with its own Vary values (RSC, Next-Router-*),
  // it does not replace them.
  response.headers.append("Vary", "Cookie");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // "/" plus any path with no dot that is not under api/, _next/, assets/ or
  // brand/. Pages never contain a dot; static files always do. Written without
  // ".*" inside the look-ahead because vinext rejects that as unsafe and would
  // then run the proxy on every path. Tested in test/proxy-matcher.test.ts.
  matcher: ["/", "/((?!api/|api$|_next/|assets/|brand/)[^.]+)"],
};
