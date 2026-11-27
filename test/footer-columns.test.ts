// L-U1: Linear-style footer columns (owner default OD-41, owner may change).
// Product lists only data/products.ts; no invented feature names; no social
// or Downloads links until real targets exist; one labelled <nav>; every
// column is a list; keyboard (DOM) order is Product, Explore, Company,
// Resources, Legal, then contact and copyright.

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { USAMSite } from "@/components/usam-site";
import { products, trustedDomain } from "@/data/products";
import { siteCopy } from "@/lib/copy";

const footerOf = (locale: "en" | "ar") =>
  /<footer class="site-footer[\s\S]*?<\/footer>/.exec(renderToStaticMarkup(createElement(USAMSite, { initialLocale: locale })))![0];

describe.each(["en", "ar"] as const)("footer (%s)", (locale) => {
  const html = footerOf(locale);
  const f = siteCopy[locale].footer;

  it("columns in order inside one labelled nav, then contact, then copyright", () => {
    expect(html).toContain(`<nav class="footer-columns" aria-label="${f.navLabel}">`);
    const order = ["footer-product", "footer-explore", "footer-company", "footer-resources", "footer-legal"].map((id) => html.indexOf(`id="${id}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf("footer-contact")).toBeGreaterThan(order[4]);
    expect(html.indexOf("<small>")).toBeGreaterThan(html.indexOf("footer-contact"));
    for (const id of ["footer-product", "footer-explore", "footer-company", "footer-resources", "footer-legal"]) {
      expect(html).toContain(`<ul aria-labelledby="${id}">`);
    }
  });

  it("Product lists exactly the products in data/products.ts, opening in a new tab with rel=noreferrer", () => {
    const col = html.slice(html.indexOf('id="footer-product"'), html.indexOf('id="footer-explore"'));
    const hrefs = [...col.matchAll(/<a href="([^"]+)" target="_blank" rel="noreferrer">/g)].map((m) => m[1]);
    expect(hrefs).toEqual(products.map((p) => trustedDomain(p.domain)));
  });

  it("Company and Resources hold the agreed pages; the Cookie Settings button stays in Legal", () => {
    expect(f.companyLinks.map((l) => l.href)).toEqual(["/about", "/trust", "/faq", "/contact", "/how-it-works", "/pricing"]);
    expect(f.resourcesLinks.map((l) => l.href)).toEqual(["/guide", "/status", "/sitemap", "/privacy-requests"]);
    const legal = html.slice(html.indexOf('id="footer-legal"'));
    expect(legal).toContain('class="footer-cookie-btn"');
    for (const l of f.legalLinks) expect(legal).toContain(`href="${l.href}"`);
  });

  it("no invented feature names, no social or download links", () => {
    expect(html).not.toMatch(/Masar|Daleel|Rasheed|Azouz|linkedin|twitter|facebook|instagram|download/i);
  });
});
