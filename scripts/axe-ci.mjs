// CI browser checks against the built server at AXE_BASE_URL
// (default http://127.0.0.1:3000). Needs playwright and @axe-core/playwright
// (CI installs them with --no-save).
//
// 1. BLOCKING: server-rendered <html lang dir> from the usam-locale cookie.
//    With JavaScript OFF (so only the server HTML counts), "/" and "/faq" must
//    be lang=ar dir=rtl with cookie usam-locale=ar, and lang=en dir=ltr with no
//    cookie. HTML must also carry Vary: Cookie and Cache-Control: no-store.
//    Any failure exits 1 even when AXE_REPORT_ONLY=1.
// 2. Report-only axe scan of the main pages in English and Arabic.
//    Exit 1 on violations unless AXE_REPORT_ONLY=1 (CI sets it).
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.AXE_BASE_URL ?? "http://127.0.0.1:3000";
const pages = ["/", "/for-individuals", "/for-enterprises", "/government", "/explore", "/how-it-works", "/faq", "/trust"];
const locales = ["en", "ar"];
const reportOnly = process.env.AXE_REPORT_ONLY === "1";

const browser = await chromium.launch();

// ---- 1. lang/dir + cache headers (blocking) ----
const langDirFailures = [];
for (const { cookie, lang, dir } of [
  { cookie: "ar", lang: "ar", dir: "rtl" },
  { cookie: null, lang: "en", dir: "ltr" },
]) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  if (cookie) await context.addCookies([{ name: "usam-locale", value: cookie, url: base }]);
  for (const path of ["/", "/faq"]) {
    const label = `[lang-dir cookie=${cookie ?? "none"}] ${path}`;
    const page = await context.newPage();
    try {
      const response = await page.goto(base + path, { waitUntil: "domcontentloaded" });
      const headers = response ? response.headers() : {};
      const gotLang = await page.getAttribute("html", "lang");
      const gotDir = await page.getAttribute("html", "dir");
      const vary = headers["vary"] ?? "(none)";
      const cacheControl = headers["cache-control"] ?? "(none)";
      console.log(`${label}: status=${response?.status()} lang=${gotLang} dir=${gotDir} | Vary: ${vary} | Cache-Control: ${cacheControl}`);
      if (gotLang !== lang || gotDir !== dir) langDirFailures.push(`${label}: expected lang=${lang} dir=${dir}`);
      if (!/(^|,\s*)cookie(\s*,|$)/i.test(vary)) langDirFailures.push(`${label}: Vary has no Cookie`);
      if (!/no-store/i.test(cacheControl)) langDirFailures.push(`${label}: Cache-Control has no no-store`);
    } catch (error) {
      langDirFailures.push(`${label}: ERROR ${error instanceof Error ? error.message : error}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
}
for (const f of langDirFailures) console.log(`FAIL ${f}`);
console.log(`lang-dir check: ${langDirFailures.length === 0 ? "pass" : `${langDirFailures.length} failure(s)`} (blocking)`);

// ---- 2. axe (report-only in CI) ----
let total = 0;
for (const locale of locales) {
  const context = await browser.newContext();
  // The server reads the cookie; the client also restores from localStorage.
  await context.addCookies([{ name: "usam-locale", value: locale, url: base }]);
  await context.addInitScript((value) => {
    try { localStorage.setItem("usam-locale", value); } catch {}
  }, locale);
  for (const path of pages) {
    const page = await context.newPage();
    try {
      await page.goto(base + path, { waitUntil: "networkidle" });
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      console.log(`[${locale}] ${path}: ${violations.length} violation(s)`);
      for (const v of violations) {
        console.log(`  - ${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.help}`);
      }
      total += violations.length;
    } catch (error) {
      // A page that cannot load or scan counts as one error, not a crash.
      console.log(`[${locale}] ${path}: ERROR ${error instanceof Error ? error.message : error}`);
      total += 1;
    } finally {
      await page.close();
    }
  }
  await context.close();
}
await browser.close();
console.log(`axe total violations: ${total}${reportOnly ? " (report-only)" : ""}`);
if (langDirFailures.length > 0) process.exit(1);
process.exit(total > 0 && !reportOnly ? 1 : 0);
