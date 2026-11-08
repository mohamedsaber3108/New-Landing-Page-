// USAM Master — browser acceptance checks (Playwright/Chromium) against the LIVE site.
//
// PURPOSE: real-browser measurement of the interaction/visual/print items that
// HTTP/HTML scans cannot prove. Read-only against production (GET + client-side
// interaction only; NO form submissions, NO writes).
//
// HOW TO RUN (isolated; does NOT touch this project's deps):
//   mkdir %TEMP%\usam-bt && cd %TEMP%\usam-bt
//   npm init -y && npm i playwright@latest && npx playwright install chromium
//   copy this file there (or set BASE) and:  node acceptance-browser-checks.js
//   -> writes acceptance-results.json and privacy-print-preview.pdf
//
// Evidence notes baked into the output:
//  - 200% zoom is a CSS zoom:2 APPROXIMATION, not native browser zoom (unverified natively).
//  - The PDF is exported; page-break aesthetics require a human glance.
//
// Verified against production commit 9346c97 on 2026-10-20.

const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.USAM_BASE || "https://usamif.com";
const R = [];
const rec = (name, status, evidence) => R.push({ name, status, evidence });

function parseRGB(s) {
  const m = (s || "").match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2] };
}
function lum({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
  const a = parseRGB(fg), b = parseRGB(bg);
  if (!a || !b) return null;
  const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b));
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
async function effBg(locator) {
  return await locator.evaluate((el) => {
    let n = el;
    while (n) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      n = n.parentElement;
    }
    return "rgb(255,255,255)";
  });
}
async function sampleContrast(page, selector, label, out) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) { out.push(`${label}: absent`); return; }
  const color = await loc.evaluate((el) => getComputedStyle(el).color);
  const bg = await effBg(loc);
  out.push(`${label}: ${contrast(color, bg)}:1 (fg ${color} / bg ${bg})`);
}
async function setTheme(page, want) {
  for (let i = 0; i < 3; i++) {
    const cls = await page.getAttribute("div.usam-app", "class").catch(() => "");
    if (cls && cls.includes(`theme-${want}`)) return true;
    await page.locator(".nav-actions .icon-button").first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  return (await page.getAttribute("div.usam-app", "class").catch(() => "")).includes(`theme-${want}`);
}
async function setLocale(page, want) {
  for (let i = 0; i < 2; i++) {
    if ((await page.getAttribute("html", "lang").catch(() => "")) === want) return true;
    await page.locator("button.locale-button").first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  return (await page.getAttribute("html", "lang").catch(() => "")) === want;
}

async function main() {
  const browser = await chromium.launch();

  // 1. RTL geometry
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/privacy", { waitUntil: "networkidle", timeout: 45000 });
    await setLocale(p, "ar"); await p.waitForTimeout(500);
    const geo = await p.evaluate(() => {
      const s = document.querySelector(".legal-summary");
      return { htmlDir: document.documentElement.dir, summaryDir: s ? getComputedStyle(s).direction : null, summaryTextAlign: s ? getComputedStyle(s).textAlign : null };
    });
    rec("1 RTL layout geometry (AR /privacy)",
      geo.htmlDir === "rtl" && geo.summaryDir === "rtl" ? "PASS" : "FAIL",
      `htmlDir=${geo.htmlDir} summaryDir=${geo.summaryDir} summaryTextAlign=${geo.summaryTextAlign}`);
    await ctx.close();
  }
  // 2. Focus trap + overlay recovery
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45000 });
    const cb = p.locator("button.footer-cookie-btn").first();
    await cb.scrollIntoViewIfNeeded(); await cb.click(); await p.waitForTimeout(500);
    const count = await p.evaluate(() => { const d = document.querySelector(".cookie-modal"); return d ? Array.from(d.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')).filter(e => e.offsetParent !== null).length : 0; });
    await p.evaluate(() => { const d = document.querySelector(".cookie-modal"); const f = Array.from(d.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')).filter(e => e.offsetParent !== null); f[f.length - 1].focus(); });
    await p.keyboard.press("Tab"); await p.waitForTimeout(150);
    const tabInside = await p.evaluate(() => !!document.querySelector(".cookie-modal")?.contains(document.activeElement));
    await p.evaluate(() => { const d = document.querySelector(".cookie-modal"); const f = Array.from(d.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')).filter(e => e.offsetParent !== null); f[0].focus(); });
    await p.keyboard.press("Shift+Tab"); await p.waitForTimeout(150);
    const shiftInside = await p.evaluate(() => !!document.querySelector(".cookie-modal")?.contains(document.activeElement));
    rec("2 Cookie modal focus trap (both boundaries)", count && tabInside && shiftInside ? "PASS" : "FAIL", `focusables=${count} Tab@last->inside=${tabInside} ShiftTab@first->inside=${shiftInside}`);
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    const cookieClosed = (await p.locator(".cookie-modal").count()) === 0;
    const of1 = await p.evaluate(() => getComputedStyle(document.body).overflow);
    await p.locator("button.guide-trigger").first().click(); await p.waitForTimeout(700);
    const askOpen = await p.locator('[role="dialog"]').count();
    await p.keyboard.press("Escape"); await p.waitForTimeout(400);
    const askClosed = (await p.locator('[role="dialog"]').count()) === 0;
    const of2 = await p.evaluate(() => getComputedStyle(document.body).overflow);
    const backdrop = await p.evaluate(() => !!document.querySelector(".cookie-modal-backdrop"));
    let navWorks = false;
    try { await p.locator('.site-footer a[href="/legal"]').first().click({ timeout: 3000 }); await p.waitForLoadState("domcontentloaded"); navWorks = p.url().endsWith("/legal"); } catch {}
    rec("2 Overlay recovery (cookie<->AskUSAM)", cookieClosed && askClosed && of1 !== "hidden" && of2 !== "hidden" && !backdrop && navWorks ? "PASS" : "FAIL", `cookieClosed=${cookieClosed} askOpen=${askOpen} askClosed=${askClosed} overflowAfterCookie=${of1} overflowAfterAsk=${of2} stuckBackdrop=${backdrop} navWorksAfter=${navWorks}`);
    await ctx.close();
  }
  // 3. Clicks + anchor under sticky header
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const checks = [];
    await p.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45000 });
    await p.locator('.site-footer a[href="/privacy"]').first().click(); await p.waitForLoadState("networkidle");
    checks.push(`footer->/privacy url=${p.url().endsWith("/privacy")}`);
    const first = p.locator(".legal-toc a").first();
    const href = await first.getAttribute("href"); await first.click(); await p.waitForTimeout(600);
    const anchor = await p.evaluate((id) => { const el = document.getElementById(id); if (!el) return "missing"; const r = el.getBoundingClientRect(); const h = document.querySelector(".site-header"); const hb = h ? h.getBoundingClientRect().bottom : 0; return `headingTop=${Math.round(r.top)} stickyBottom=${Math.round(hb)} below=${r.top >= hb - 2}`; }, (href || "").replace("#", ""));
    checks.push(`anchor:${anchor}`);
    const ctxLink = p.locator('.legal-sections a[href="/cookies"]').first();
    if (await ctxLink.count()) { await ctxLink.click(); await p.waitForLoadState("networkidle"); checks.push(`inText->/cookies url=${p.url().endsWith("/cookies")}`); }
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    try { await p.locator('a[href="/for-enterprises"]').first().click({ timeout: 4000 }); await p.waitForLoadState("domcontentloaded"); checks.push(`nav->/for-enterprises url=${p.url().endsWith("/for-enterprises")}`); } catch (e) { checks.push("nav-err"); }
    rec("3 clicks reach destinations + anchor below sticky header", anchor.includes("below=true") && checks.every(c => !c.includes("url=false") && !c.includes("missing") && !c.includes("err")) ? "PASS" : "PARTIAL", checks.join(" | "));
    await ctx.close();
  }
  // 4. Viewports + zoom
  {
    for (const [w, h, label] of [[375, 812, "mobile"], [768, 1024, "tablet"], [1280, 900, "desktop"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      await p.goto(BASE + "/privacy", { waitUntil: "networkidle", timeout: 45000 });
      const of = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
      let fits = "no-modal";
      const cb = p.locator("button.footer-cookie-btn").first();
      if (await cb.count()) { await cb.scrollIntoViewIfNeeded(); await cb.click(); await p.waitForTimeout(400); fits = await p.evaluate(() => { const m = document.querySelector(".cookie-modal"); if (!m) return "no-modal"; const r = m.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; }); await p.keyboard.press("Escape"); }
      rec(`4 @${label} ${w}px overflow + modal fit`, of.doc <= of.win + 1 && (fits === true || fits === "no-modal") ? "PASS" : "FAIL", `scrollWidth=${of.doc} innerWidth=${of.win} modalFits=${fits}`);
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(BASE + "/privacy", { waitUntil: "networkidle", timeout: 45000 });
    const zo = await p.evaluate(() => { document.body.style.zoom = "2"; const o = { doc: document.documentElement.scrollWidth, win: window.innerWidth }; document.body.style.zoom = ""; return o; });
    rec("4 200% zoom (CSS-zoom APPROXIMATION; native zoom UNVERIFIED)", zo.doc <= zo.win + 2 ? "PASS(approx)" : "PARTIAL", `@zoom2 scrollWidth=${zo.doc} innerWidth=${zo.win} — NOTE: emulated via CSS zoom, not native browser zoom`);
    await ctx.close();
  }
  // 5. Contrast both themes
  {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(BASE + "/privacy", { waitUntil: "networkidle", timeout: 45000 });
      await setTheme(p, theme); await p.waitForTimeout(400);
      const out = [];
      await sampleContrast(p, ".legal-sections p", "legal body", out);
      await sampleContrast(p, ".legal-summary", "legal summary", out);
      await sampleContrast(p, ".legal-meta dd", "meta value", out);
      await sampleContrast(p, "h1", "h1", out);
      await sampleContrast(p, ".legal-sections a[href]", "in-text link", out);
      await p.goto(BASE + "/contact", { waitUntil: "networkidle" }); await setTheme(p, theme);
      await sampleContrast(p, "label", "form label", out);
      await sampleContrast(p, ".primary-button, button[type=submit]", "primary button", out);
      await p.goto(BASE + "/cookies", { waitUntil: "networkidle" }); await setTheme(p, theme);
      await sampleContrast(p, ".cookie-settings p", "cookie panel text", out);
      const ratios = out.map(s => parseFloat((s.match(/: ([\d.]+):1/) || [])[1])).filter(x => !isNaN(x));
      const minR = ratios.length ? Math.min(...ratios) : null;
      rec(`5 contrast ratios (${theme} theme)`, minR === null ? "NOT VERIFIED" : (minR >= 4.5 ? "PASS" : "FAIL"), `min=${minR}:1 | ` + out.join(" ; "));
      await ctx.close();
    }
  }
  // 6. Print -> PDF
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(BASE + "/privacy", { waitUntil: "networkidle", timeout: 45000 });
    await p.emulateMedia({ media: "print" });
    const vis = await p.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !e ? "absent" : (getComputedStyle(e).display === "none" ? "hidden" : "visible"); }; return { header: v(".site-header"), footer: v(".site-footer"), toc: v(".legal-toc"), sections: v(".legal-sections"), meta: v(".legal-meta") }; });
    await p.pdf({ path: "privacy-print-preview.pdf", format: "A4", printBackground: true });
    const sz = fs.statSync("privacy-print-preview.pdf").size;
    const secCount = await p.evaluate(() => document.querySelectorAll(".legal-sections section").length);
    rec("6 print/PDF export (chrome hidden, content present)", vis.header === "hidden" && vis.footer === "hidden" && vis.sections === "visible" && sz > 20000 && secCount >= 5 ? "PASS" : "PARTIAL", `pdfBytes=${sz} sections=${secCount} printVis=${JSON.stringify(vis)} — NOTE: exported only; page-break aesthetics/clipping require human inspection of the PDF`);
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync("acceptance-results.json", JSON.stringify(R, null, 2));
  console.log("DONE", R.length, "checks");
}
main().catch(e => { fs.writeFileSync("acceptance-results.json", JSON.stringify([{ name: "FATAL", status: "ERROR", evidence: e.message }], null, 2)); process.exit(1); });
