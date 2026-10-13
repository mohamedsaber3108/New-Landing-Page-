# USAM Legal / Privacy / Consent — Implementation Report (Master website)

**Repository:** USAM Master (`usamif.com`) — a bilingual discovery & enquiry
portal on Vinext (Next 16 / React 19 RSC) + Cloudflare Workers + D1 (Drizzle).
**Scope delivered here:** everything the Master website owns. Platform work
(Education, Career, Freelancing, Kids) is specified in
`docs/USAM-legal-cross-platform-contract.md` and is **not** delivered by this
repo.

**Honesty posture:** no shopping cart, checkout, card form, wallet, or billing
engine was added to the Master. All policy text ships as **draft** (provisional)
until a human publishes a reviewed version through the admin. Unverified
business/legal facts are written as visible `[REQUIRES LEGAL REVIEW]` /
`[REQUIRES CONFIGURATION]` markers, never invented.

---

## 1. What was built

### Public pages (all EN/AR, RTL, anchored sections, mobile, light/dark)
Rendered inside the existing site shell (nav + footer + Ask USAM preserved).

| Route | Page | Reuse/new |
|---|---|---|
| `/legal` | Legal Center index + applicable frameworks | new |
| `/privacy` | Privacy Policy | reused route, upgraded |
| `/terms` | Terms of Use | reused route, upgraded |
| `/cookies` | Cookie Policy + embedded Cookie Settings | reused route, upgraded |
| `/refunds` | Refund & Cancellation Policy | new |
| `/payments` | Payment Security & Currency | new |
| `/ai-use` | AI & Data Use | new |
| `/privacy-requests` | Privacy Requests & Contact + request form | new |

All added to `app/sitemap.ts` via `lib/site.ts` `SITEMAP_PATHS`. Existing links
to `/privacy`, `/terms`, `/cookies` are preserved.

### Consent & acceptance (draft-aware, server-derived, distinct events)
- **Acceptance is tied to publication state, not to drafts.** A required Terms
  checkbox is shown **only when the Terms policy is actually published** as a
  consistent EN+AR release. While Terms are draft (the state today), the forms
  show a **privacy-notice line** instead of a contractual gate, and ordinary
  enquiry submission stays usable. This resolves the earlier inconsistency of
  requiring acceptance of unpublished Terms.
- The requirement is **derived server-side** in `createLead` from
  `getPolicyRequirement("terms")` — the client's claim is never trusted. If
  Terms are published and not accepted, the server returns 422 before any write;
  if Terms are draft, no acceptance is required or recorded.
- Events are **distinct and accurate**: `terms_acceptance` (only when published,
  stamped with the **server's** published version), `privacy_acknowledgement`
  (only when privacy is published and acknowledged), `privacy_notice_presented`
  (notice shown, **not** consent — used while draft), `marketing_consent`
  (explicit `granted`/`denied`, never granted when unchecked), and
  `cookie_choice`. All written in the SAME D1 batch as the lead.
- The forms: Contact, Enterprise and Government all use a shared
  `AcceptanceFields` component + `useLegalRequirements()` so behavior is
  consistent; Government previously had no marketing checkbox — added.
- The Master creates **no account**, so no separate Master signup system was
  invented (per instruction §7).

### Publication consistency
- `resolvePolicy` marks a policy **published** to the public only when BOTH
  locales are published at the **same version**; a half-published or
  version-mismatched release renders available text but keeps the honest
  **draft** badge, so a draft is never presented as a final policy.
- Protected **draft preview** for staff: `GET /api/v1/admin/policies?type=&preview=&locale=`
  returns the true per-locale draft (admin-gated).
- Acceptance records carry the server's published version, so public pages, the
  legal API, and recorded consent all reference the same release.

### Cookie consent (real, not decorative)
- `lib/consent-manager.ts` is a real consent engine: optional categories are off
  until an explicit choice; a choice actually gates optional-script loading and
  withdrawal tears it down (or reloads if no teardown exists); the choice is
  versioned so a material cookie-policy change re-prompts.
- **The site uses only necessary/functional storage today** (language, theme,
  and the cookie-choice record). Because `OPTIONAL_TECHS` is empty, the banner
  does **not** appear — this is by design, not an omission, and avoids a
  misleading "accept tracking" popup. The code path is complete: registering a
  tracker turns the banner on with equal Accept all / Reject optional / Customize
  controls.
- **Cookie Settings** is always reachable from the footer (and embedded in the
  Cookie Policy page). It honestly reports "only necessary/functional storage"
  and lets users review/clear. The banner sits at a lower z-index than Ask USAM
  and leaves room for it on mobile.

### Privacy requests & admin workflow
- `/privacy-requests` form → `POST /api/v1/privacy-requests` → stores the request
  and returns a **receipt reference** (`PRQ-XXXXXX`). The receipt is explicitly
  "not approval"; nothing is disclosed or deleted at submission.
- Fulfilment is gated on `identity_verified` (defaults false). Staff manage the
  queue via `GET/PATCH /api/v1/admin/privacy-requests` (identity verification,
  status, assignment, note). No deletion/export from an email address alone.
- Policy versioning: `GET/POST /api/v1/admin/policies` lists overview/history and
  publishes a reviewed version. Publishing retires the previous `current` row
  (kept in history) and never overwrites the baseline. `GET /api/v1/admin/consent`
  gives aggregate consent coverage/withdrawals and per-reference evidence.
- All admin endpoints use the existing `authorizeAdmin` (`USAM_ADMIN_TOKEN`,
  `x-admin-token` header, **fail-closed 403** when unset).

### Currency
- `/payments` and `/pricing` state EGP as the base currency for USAM-owned
  pricing, that the Master invents no prices, that any other-currency figure is a
  labelled estimate (not the final charge), and that the final charge
  currency/amount/taxes/fees appear on the selling platform. Historical foreign
  transactions are not relabeled as EGP (stated as policy; enforced on platforms).

### Data layer (migration `0004_serious_chamber.sql`, additive)
- `consent_events` — distinct, auditable consent/acceptance evidence.
- `privacy_requests` — DSR lifecycle with identity-verification gate.
- `policy_publications` — versioned published policies with retained history.

---

## 2. Policy placement matrix

| Surface | What appears | Source |
|---|---|---|
| Footer (every page) | Legal Center, Privacy, Terms, Cookies, Refunds & Cancellations, Payment Security, **Cookie Settings** button; utility row adds AI & Data Use, Privacy Requests | `components/usam-site.tsx` Footer |
| Legal Center `/legal` | Index of all 7 policies with scope + version + draft/published badge; applicable Egypt/KSA frameworks; review-marker note | `LegalCenter` |
| Each policy page | Scope, applies-to, version, effective date, last-updated, draft/published badge, table of contents, anchored sections | `LegalPolicy` |
| Cookie page `/cookies` | Policy + embedded live Cookie Settings panel | `CookieSettingsPanel` |
| Privacy Requests `/privacy-requests` | Policy + working request form (receipt, identity-verification notice) | `PrivacyRequestForm` |
| Contact / Enterprise / Government forms | Required Terms checkbox + Privacy link + optional marketing checkbox | `contact-lead-form.tsx`, `enquiry-form.tsx` |
| Pricing `/pricing` | EGP base-currency + estimate-vs-final-charge disclosure | `page-content.tsx` |
| Cookie banner | Only if an optional tracker is registered (none today) | `CookieConsent` |

---

## 3. Cross-platform integration checklist (summary)

Full detail: `docs/USAM-legal-cross-platform-contract.md`. Each platform repo
must, in its own deployment:

- [ ] Consume `GET https://usamif.com/api/v1/legal/{type}?locale=` for shared
      policy versions; treat `approval:"draft"` as non-binding.
- [ ] Show signup Terms (required) + Privacy link + optional marketing; enforce
      server-side incl. social signup; record distinct consent events with version.
- [ ] Make optional marketing/cookies refusable without blocking registration.
- [ ] Implement cookie consent that actually gates the platform's own trackers.
- [ ] Show final currency/amount/taxes/fees + refund link + provider before pay.
- [ ] Publish binding refund/cancellation rules organized by real offering.
- [ ] Use hosted/tokenized payment; no raw card data retained; verify webhooks.
- [ ] Provide a Privacy Center + DSR workflow with identity verification + audit.
- [ ] Store transaction amounts in the actual currency; no silent EGP relabeling.
- [ ] Kids: guardian/age mechanics, not the adult signup flow.
- [ ] Publish no PCI/"100% secure"/bank-partnership claims without evidence.

**The Master cannot and does not complete these.** Ecosystem completion requires
the platform repos.

---

## 4. Test & verification results

- **Build:** `npm run build` — success; all new routes registered.
- **Tests:** `npm run test` — **83/83 pass** across 10 files. Coverage includes:
  - Draft vs published Terms: no gate while draft (submission succeeds), 422
    once Terms are published and not accepted, `terms_acceptance` stamped with
    the server's published version, `privacy_notice_presented` while draft.
  - Marketing recorded `denied` when unchecked (never granted).
  - Privacy requests: receipt + unverified default; **invalid status transition
    rejected (409)**; **sensitive request blocked from completion while identity
    unverified (422)**, allowed after verification; no transition out of a
    terminal state; **idempotent** duplicate (same key → same ref, no duplicate;
    different body → 409).
  - All new admin routes **fail closed (403)** without a token.
  - Consent engine (controlled fake tracker): nothing loads before a choice;
    loads only on accept; stays off on reject; **tears down on withdrawal**; no
    banner when no optional tech exists.
- **Lint:** new files clean. (Two pre-existing `set-state-in-effect` findings in
  `usam-site.tsx` and `test/fake-db.ts` aliasing are unchanged by this work.)
- **Live dev-server verification (migration 0004 applied locally):**
  - All 7 policies serve EN **and** AR with honest `approval:"draft"`.
  - Admin endpoint returns **403** with no token (fail-closed).
  - Privacy request persists → `PRQ-…`, `status:received`, `identity_verified=0`.
  - Consent event records (`recorded:true`); verified in D1 that an accepted lead
    carries version-stamped terms + privacy + marketing events tied to its ref.
  - Terms enforcement: 422 when not accepted, 201 when accepted.
  - Publication override: after publishing `privacy/en`, the public API served
    `approval:"published"` for `privacy/en` while `privacy/ar` and `terms/en`
    correctly fell back to the draft baseline (per-locale, no-overwrite, history
    retained). Test rows then removed.

### Browser verification status (honest)
**No browser/DOM tooling is available in this environment** (no Playwright,
Puppeteer, Cypress, jsdom, or happy-dom is installed, and there is no headless
browser). I therefore did **not** perform visual or interaction QA. What I
verified instead, programmatically against a running dev server:

- Every legal route returns HTTP 200 and serves the app shell:
  `/legal`, `/privacy`, `/terms`, `/cookies`, `/refunds`, `/payments`,
  `/ai-use`, `/privacy-requests`, plus `/pricing`.
- `GET /api/v1/legal/requirements` reports `terms.published=false` and
  `privacy.published=false` today, so the forms render the privacy-notice line
  (no Terms gate) — the corrected draft behavior, confirmed at the HTTP layer.
- The new CSS classes (`.cookie-banner`, `.cookie-settings`, `.legal-center`,
  `.legal-doc`, `.footer-legal`, `.lead-notice`) are present in the stylesheet.

### Manual browser QA checklist (must be done by a human before sign-off)
Run `npm run dev`, open `http://localhost:5173`, and check:

1. **Footer links** — every legal link (`Legal Center`, `Privacy`, `Terms`,
   `Cookies`, `Refunds & Cancellations`, `Payment Security`, plus utility row
   `AI & Data Use`, `Privacy Requests`) navigates to the right page.
2. **Cookie Settings** — the footer "Cookie Settings" button opens the modal;
   it reports "only necessary/functional storage"; Escape and the ✕ close it.
   Confirm NO cookie banner appears (there are no optional trackers).
3. **Forms** — Contact, Enterprise, Government: submit succeeds; today (Terms
   draft) a privacy-notice line shows, not a required Terms checkbox; the
   optional marketing checkbox is unchecked by default and refusing it does not
   block submission; a reference is shown on success.
4. **Arabic / RTL** — switch to العربية: policy pages, ToC, forms, cookie modal
   mirror correctly; no broken mixed-direction layout.
5. **Keyboard** — Tab through a form and the cookie modal; focus is visible;
   the modal traps/returns focus and closes on Escape.
6. **Mobile** — at ~375px width, policy pages, footer, and the cookie modal are
   usable and not clipped.
7. **Dark mode** — toggle theme; legal pages, badges, and cookie UI remain
   legible with correct contrast.
8. **Ask USAM overlap** — the floating Ask USAM button is not covered by any
   legal UI; on mobile the (currently hidden) banner area leaves room for it.

---

## 5. Unresolved legal/business facts (must be confirmed before publishing)

These are intentionally left as visible markers in `lib/legal/policies.ts` and
must be set by the owner with legal review. **Do not publish any policy as final
until these are resolved and a human publishes the reviewed version.**

1. **Registered legal entity name, address, and registration number** for the
   Master operator (currently `[REQUIRES LEGAL REVIEW]`).
2. **Privacy/DPO contact email** (`[REQUIRES CONFIGURATION]`).
3. **Lawful basis** per processing purpose under Egypt PDPL and KSA PDPL.
4. **Retention periods** for enquiries, consent evidence, and privacy requests.
5. **Governing law and dispute venue** for the Terms.
6. **Which data-subject rights apply** and any legal retention exceptions, per
   jurisdiction.
7. **Refund eligibility windows and processing timeframes** — set/published by
   each selling platform, not the Master.
8. **Payment provider identity and capabilities** on the platforms (the Commerce
   reference names Bank of Alexandria with credentials provided separately;
   nothing is configured or claimed here).
9. **Kids age thresholds and guardian-consent mechanics** (platform-side).
10. **International-transfer safeguards and the processor/subprocessor inventory**.

### Verified legal context used (official-source review)
- **Egypt:** Personal Data Protection Law No. 151 of 2020; Executive Regulations
  via Minister of Communications & IT Decree No. 816 of 2025; full-compliance
  deadline **31 October 2026**; PDPC supervises; breach notice within 72 hours.
- **Saudi Arabia:** PDPL (Royal Decree M/19, amended M/148); fully enforceable
  since **14 September 2024**; SDAIA is the competent authority.
  _(Legal sources were reviewed and summarized; this is applicable context, not a
  compliance determination. Content was rephrased for compliance with source
  licensing.)_

---

## 6. Deploy notes

- Full ordered procedure (confirm runtime → backup → build → migrate → restart
  → smoke-test → rollback) is in **`docs/USAM-legal-deploy-runbook.md`**.
- Production runs the app as a **systemd `usam`** service via **wrangler
  `--local --persist-to .wrangler/state`** — a **local Miniflare SQLite file**,
  **not** managed Cloudflare D1. The runbook's Step 0 re-confirms this before any
  destructive step.
- Migration **`0004_serious_chamber.sql`** is **additive** (three new tables).
  Until applied, the privacy-request and consent endpoints fail **closed** with a
  clear 503 — no silent data loss. `scripts/apply-migration-local.mjs` applies it
  idempotently to the local Miniflare SQLite (used both for dev and for this
  local-D1 production runtime).
- Set `USAM_ADMIN_TOKEN` to enable staff endpoints; until then they return 403.
- No DNS, domain, email, or homepage changes were made. The completed domain
  migration is untouched.
