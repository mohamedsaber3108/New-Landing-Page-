// "No visible change" guard for the copy split (008, L-Q2).
//
// Server-renders the real site shell (USAMSite) for the home page and every
// informational route, in English and Arabic, to static HTML, and compares a
// SHA-256 of that HTML (plus its length) with a committed snapshot. The
// snapshot was recorded on main BEFORE the copy moved; after the refactor the
// HTML (text, order, links, classes, rel/target, bdi/lang wrappers) must be
// byte-identical. Hashes keep the snapshot small (the raw HTML is ~1.9 MB).
// Any intended copy edit must update the snapshot on purpose (`vitest -u`)
// and say so in the PR.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { USAMSite } from "@/components/usam-site";
import { routes } from "@/data/products";

const slugs = Object.keys(routes).sort();

function fingerprint(html: string) {
  return { bytes: html.length, sha256: createHash("sha256").update(html).digest("hex") };
}

describe.each(["en", "ar"] as const)("server HTML (%s)", (locale) => {
  it("home", () => {
    expect(fingerprint(renderToStaticMarkup(createElement(USAMSite, { initialLocale: locale })))).toMatchSnapshot();
  });
  it.each(slugs)("/%s", (slug) => {
    expect(
      fingerprint(renderToStaticMarkup(createElement(USAMSite, { kind: "info", slug, initialLocale: locale }))),
    ).toMatchSnapshot();
  });
});
