// Server-rendered <html lang dir> from the usam-locale cookie (007, D-12).
// Renders the real RootLayout to an HTML string (what a visitor with JS off
// receives) with next/headers cookies() mocked per request.

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const cookieValue: { current: string | undefined } = { current: undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "usam-locale" && cookieValue.current !== undefined ? { name, value: cookieValue.current } : undefined),
  }),
}));

import RootLayout from "@/app/layout";
import { isolateLtr } from "@/components/bidi";
import { localeFromCookie } from "@/lib/locale";

async function html(cookie: string | undefined): Promise<string> {
  cookieValue.current = cookie;
  const tree = await RootLayout({ children: createElement("p", null, "x") });
  return renderToStaticMarkup(tree);
}

describe("server html lang/dir", () => {
  it('Arabic cookie -> <html lang="ar" dir="rtl">', async () => {
    const out = await html("ar");
    expect(out).toMatch(/^<html lang="ar" dir="rtl">/);
  });

  it("English cookie, no cookie, or an unknown value -> lang=en dir=ltr", async () => {
    for (const value of ["en", undefined, "fr", "AR", "<script>"]) {
      expect(await html(value)).toMatch(/^<html lang="en" dir="ltr">/);
    }
    expect(localeFromCookie("ar")).toBe("ar");
  });
});

describe("isolateLtr (bdi for English runs and numbers in Arabic text)", () => {
  const render = (text: string) => renderToStaticMarkup(createElement("p", null, isolateLtr(text)));

  it("wraps the 429 wait number and Latin names in Arabic text", () => {
    expect(render("طلبات كثيرة جدًا. انتظر 500 ثانية ثم حاول مرة أخرى.")).toContain("<bdi>500</bdi>");
    expect(render("مثل USAM-XXXXXX فأضفه")).toContain('<bdi lang="en">USAM-XXXXXX</bdi>');
    expect(render("إلى Google (Google Workspace، وفق")).toContain('<bdi lang="en">Google Workspace</bdi>');
  });

  it("leaves English-only text unchanged", () => {
    expect(render("Too many requests. Please wait 500 seconds.")).toBe("<p>Too many requests. Please wait 500 seconds.</p>");
  });
});
