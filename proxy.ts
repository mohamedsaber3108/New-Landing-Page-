// Next 16 / vinext request proxy (formerly middleware).
//
// HTML pages depend on the usam-locale cookie (server-rendered <html lang dir>
// and page text), so no shared cache may store them or serve one visitor's
// language to another. vinext ignores a `Vary` from next.config headers()
// for these pages, so the headers are set here, where vinext merges `Vary`
// and lets the proxy own `Cache-Control`.
//
// API routes, build assets and public files are passed through unchanged.

import { NextResponse, type NextRequest } from "next/server";

const PASS_THROUGH = /^\/(?:api\/|_next\/|brand\/|favicon\.svg$|file\.svg$|globe\.svg$|window\.svg$|robots\.txt$|sitemap\.xml$)/;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (PASS_THROUGH.test(request.nextUrl.pathname)) return response;
  response.headers.set("Vary", "Cookie");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
