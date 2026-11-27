// Real-browser workflow tests (D-03, L-Q3). See e2e/playwright.config.mjs.
//
// Each form test submits through the real UI and reads the record back through
// the admin API with the CI-only token (E2E_ADMIN_TOKEN, generated in the job,
// never committed). Every browser context and API call sends its own
// X-Real-IP, so the per-IP rate limits (PR #7) never return 429 here.
//
// Deliberate-break check (proves the suite fails): rename a form field, e.g.
// name="organization" -> name="org" in components/enquiry-form.tsx; the
// enterprise and government tests then fail at the fill step.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TOKEN = process.env.E2E_ADMIN_TOKEN;

let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `10.77.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

// A fresh, distinct client IP per test (browser requests go through the page).
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "X-Real-IP": nextIp() });
});

/** GET an admin endpoint with the CI token; returns the `data` envelope. */
async function admin(request, path) {
  expect(TOKEN, "E2E_ADMIN_TOKEN must be set by the CI job").toBeTruthy();
  const res = await request.get(path, { headers: { "x-admin-token": TOKEN, "X-Real-IP": nextIp() } });
  expect(res.status(), `admin ${path}`).toBe(200);
  return (await res.json()).data;
}

/** Every visible control in the form has a visible text label. */
async function expectVisibleLabels(form) {
  const controls = await form.evaluate((f) =>
    [...f.querySelectorAll("input:not([type=hidden]),select,textarea")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        name: el.getAttribute("name"),
        label: el.labels && el.labels[0] ? el.labels[0].innerText.trim() : "",
      })),
  );
  expect(controls.length).toBeGreaterThan(0);
  for (const c of controls) expect(c.label, `visible label for [name=${c.name}]`).not.toBe("");
}

async function expectAutocomplete(form, map) {
  for (const [name, value] of Object.entries(map)) {
    await expect(form.locator(`[name="${name}"]`)).toHaveAttribute("autocomplete", value);
  }
}

/** Submit, then expect the polite live-region success state with a reference. */
async function submitAndGetReference(page, form, prefix) {
  await form.locator('button[type="submit"]').click();
  const status = page.locator('section[role="status"][aria-live="polite"]');
  await expect(status).toBeVisible();
  const ref = (await status.locator(".lead-reference").innerText()).trim();
  expect(ref).toMatch(new RegExp(`^${prefix}-[A-Z0-9]{6}$`));
  return ref;
}

test.describe("contact form", () => {
  test("labels, autocomplete, data kept on error, aria-live success, admin read-back", async ({ page, request }) => {
    await page.goto("/contact");
    const form = page.locator("section.lead-form form").first();
    await expectVisibleLabels(form);
    await expectAutocomplete(form, { name: "name", email: "email", organization: "organization" });

    const email = `contact.${Date.now()}@example.test`;
    await form.locator('[name="name"]').fill("E2E Contact");
    await form.locator('[name="email"]').fill(email);
    await form.locator('[name="message"]').fill("short");
    await form.locator('button[type="submit"]').click();
    // Error shown as text, and the entered data is kept.
    await expect(page.locator(".lead-error[role=alert]")).toBeVisible();
    await expect(form.locator('[name="name"]')).toHaveValue("E2E Contact");
    await expect(form.locator('[name="email"]')).toHaveValue(email);

    await form.locator('[name="message"]').fill("This is an end-to-end contact test message.");
    const ref = await submitAndGetReference(page, form, "USAM");

    const data = await admin(request, "/api/v1/admin/leads?limit=200");
    const lead = data.leads.find((l) => l.reference === ref);
    expect(lead, `lead ${ref} in admin inbox`).toBeTruthy();
    expect(lead.email).toBe(email);
    expect(lead.name).toBe("E2E Contact");
    expect(lead.kind).toBe("general");
  });

  test("KNOWN GAP: field errors are linked to the field (aria-invalid + aria-describedby)", async ({ page }) => {
    // Expected to fail today: the forms show one top-level alert only. When
    // per-field errors are added this test starts passing and Playwright
    // reports it, so remove test.fail() then.
    test.fail();
    await page.goto("/contact");
    const form = page.locator("section.lead-form form").first();
    await form.locator('[name="name"]').fill("E2E Gap");
    await form.locator('[name="email"]').fill("not-an-email");
    await form.locator('[name="message"]').fill("short");
    await form.locator('button[type="submit"]').click();
    const emailField = form.locator('[name="email"]');
    await expect(emailField).toHaveAttribute("aria-invalid", "true", { timeout: 3000 });
    const describedBy = await emailField.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).not.toBeEmpty();
  });
});

for (const variant of ["enterprise", "government"]) {
  test(`${variant} enquiry: submit and read back structured fields`, async ({ page, request }) => {
    await page.goto(variant === "enterprise" ? "/for-enterprises" : "/government");
    const form = page.locator("#enquiry-form form");
    await expectVisibleLabels(form);
    await expectAutocomplete(form, { name: "name", email: "email", organization: "organization", phone: "tel" });

    const email = `${variant}.${Date.now()}@example.test`;
    await form.locator('[name="name"]').fill(`E2E ${variant}`);
    await form.locator('[name="email"]').fill(email);
    await form.locator('[name="organization"]').fill(`E2E ${variant} Org`);
    await form.locator('[name="role"]').fill("Head of Learning");
    await form.locator('[name="phone"]').fill("+20 100 000 0000");
    await form.locator('[name="country"]').fill("Egypt");
    const firstType = await form.locator('[name="enquiryType"] option:not([disabled])').first().getAttribute("value");
    await form.locator('[name="enquiryType"]').selectOption(firstType);
    if (variant === "government") await form.locator('[name="beneficiaries"]').fill("Public sector staff");
    await form.locator('[name="message"]').fill(`End-to-end ${variant} enquiry message.`);
    const ref = await submitAndGetReference(page, form, "USAM");

    const data = await admin(request, `/api/v1/admin/leads?kind=${variant}&limit=200`);
    const lead = data.leads.find((l) => l.reference === ref);
    expect(lead, `lead ${ref}`).toBeTruthy();
    expect(lead.kind).toBe(variant);
    expect(lead.organization).toBe(`E2E ${variant} Org`);
    expect(lead.enquiryType).toBe(firstType);
    expect(lead.phone).toBe("+20 100 000 0000");
    if (variant === "government") expect(lead.beneficiaries).toBe("Public sector staff");
  });
}

test("privacy request: axe on the form, submit, admin read-back", async ({ page, request }) => {
  await page.goto("/privacy-requests");
  const section = page.locator("#privacy-request-form");
  await expect(section).toBeVisible();
  const form = section.locator("form");
  await expectVisibleLabels(form);
  await expectAutocomplete(form, { name: "name", email: "email" });

  const { violations } = await new AxeBuilder({ page })
    .include("#privacy-request-form")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const v of violations) console.log(`axe privacy form: ${v.id} (${v.impact}) ${v.nodes.length} node(s)`);
  // Blocking on critical; serious/moderate are printed (site-wide contrast work is tracked separately).
  expect(violations.filter((v) => v.impact === "critical").map((v) => v.id)).toEqual([]);

  const email = `privacy.${Date.now()}@example.test`;
  await form.locator('[name="requestType"]').selectOption("access");
  await form.locator('[name="name"]').fill("E2E Privacy");
  await form.locator('[name="email"]').fill(email);
  await form.locator('[name="message"]').fill("Please send me a copy of my data.");
  const ref = await submitAndGetReference(page, form, "PRQ");

  const data = await admin(request, "/api/v1/admin/privacy-requests?limit=200");
  const row = data.requests.find((r) => r.reference === ref);
  expect(row, `privacy request ${ref}`).toBeTruthy();
  expect(row.requestType).toBe("access");
  expect(row.status).toBe("received");
});

test("cookie consent: no banner without optional tech; settings dialog traps focus, Esc closes, Reset clears", async ({ page }) => {
  await page.goto("/");
  // Honest: there are no optional categories, so no banner is shown.
  await expect(page.locator(".cookie-banner")).toHaveCount(0);

  // Make a saved preference exist first.
  await page.locator(".locale-button").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => localStorage.getItem("usam-locale"))).toBe("ar");

  const opener = page.locator(".footer-cookie-btn");
  await opener.click();
  const dialog = page.locator('.cookie-modal[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `focus inside after Tab ${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(dialog).toBeVisible();
  await dialog.locator("button", { hasText: /Reset saved preferences|إعادة/ }).first().click();
  expect(await page.evaluate(() => localStorage.getItem("usam-locale"))).toBeNull();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

for (const width of [360, 1280]) {
  test(`language switch to Arabic at ${width}px: dir rtl, lang ar, kept after reload`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.locator(".locale-button").click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator(".usam-app.locale-ar")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
}

test("search on /explore returns results", async ({ page }) => {
  await page.goto("/explore");
  const box = page.locator('.explore-search input[type="search"]');
  await expect(box).toBeVisible();
  await box.fill("career");
  await expect(page.locator(".explore-result").first()).toBeVisible();
  expect(await page.locator(".explore-result").count()).toBeGreaterThan(0);
});

test("Ask USAM drawer: opens as a dialog, traps focus, Esc closes and returns focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.locator("button.guide-trigger");
  await trigger.click();
  const dialog = page.locator('[role="dialog"].guide-dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `focus inside after Tab ${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
