// Report-only axe scan of the main pages in English and Arabic.
// Needs playwright and @axe-core/playwright (CI installs them with --no-save)
// and a running server at AXE_BASE_URL (default http://127.0.0.1:3000).
// The site keeps its language in localStorage key "usam-locale".
// Exit code: 1 if any violation is found, unless AXE_REPORT_ONLY=1 (CI sets it).
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.AXE_BASE_URL ?? "http://127.0.0.1:3000";
const pages = ["/", "/for-individuals", "/for-enterprises", "/government", "/explore", "/how-it-works", "/faq", "/trust"];
const locales = ["en", "ar"];
const reportOnly = process.env.AXE_REPORT_ONLY === "1";

const browser = await chromium.launch();
let total = 0;
for (const locale of locales) {
  const context = await browser.newContext();
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
process.exit(total > 0 && !reportOnly ? 1 : 0);
