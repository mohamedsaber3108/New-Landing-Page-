# USAM legal subsystem — QA report (improvement pass 2)

**Status: Deployed; browser acceptance checks pending.** Live in production at
commit `3ef3d2e` (not fully verified — the visual/interaction checks below are
NOT VERIFIED pending a browser review). Policies remain readable, clearly
labelled **drafts** until final wording is approved.

Date: 2026-10-16. Scope: the focused correction pass on the deployed legal
subsystem, plus the follow-up that adds the legal-page print stylesheet and the
corrected platform-directory wording. Production is at `3ef3d2e`; this report's
evidence baseline is `a4d2220` (the prior pass). This report records **evidence** and
is explicit about what is PASS (verified here), NOT VERIFIED (needs a browser),
or DEFERRED (needs a business/legal input). HTTP 200 and unit tests alone are
never reported as proof of UI behavior, and no visual/interaction check is
reported as passed without a browser test.

> **Important scope note on the Arabic unit test.** `test/policy-ar-parity.test.ts`
> proves only that the Arabic policy *data* exists and that the *selection path*
> (`localizedPolicy(policy, "ar")`) returns complete, structurally-parallel
> Arabic content. It does **NOT** prove the live language toggle, the RTL visual
> layout, the Cookie Settings modal interaction, or the live preference-reset
> behavior in a browser. Those remain NOT VERIFIED (see the checklist).

## Tooling available / not available (honest statement)

- **No browser automation in this environment.** `package.json` has no
  Playwright, Puppeteer, `@vitest/browser`, `jsdom`, or `happy-dom`; vitest runs
  in the Node environment. So interactive behaviors (focus trap, scroll lock,
  the reset button's live effect on a running page, RTL visual layout, dark
  mode, responsive breakpoints, 200% zoom) **cannot be automatically verified
  here**. They are listed below as NOT VERIFIED with a concrete manual checklist.
- What *was* used: `npm run build` (vinext/Cloudflare build), `vitest run` (unit
  tests), `eslint`, and a local `npm start` server (Miniflare) probed over HTTP.

## Build / test / lint evidence

| Check | Result | Evidence |
|---|---|---|
| `npm run build` | PASS (exit 0) | Build complete, all routes emitted |
| `vitest run` | PASS — **103/103** across 14 files | was 86; +17 new (5 reset, 4 AR-parity, 8 inline-links) |
| ESLint (edited files) | exit 1 — **2 errors, 15 warnings, ALL pre-existing** | see lint baseline below |
| ESLint (newly authored files) | CLEAN (0 problems) | inline-links.ts + 3 test files |

### Lint baseline (correcting an earlier inaccurate statement)

An earlier summary called the lint run "clean / non-blocking". That was wrong:
the run exits **1** because of pre-existing errors. The accurate picture,
established by linting the deployed `ee321f5` sources (via `git stash`) and
comparing to the working tree:

| File | Baseline `ee321f5` | After this pass | New issues |
|---|---|---|---|
| `components/usam-site.tsx` | 2 errors, 14 warnings | 2 errors, 14 warnings | **0** |
| `components/page-content.tsx` | 0 errors, 1 warning (`setQuery` unused) | 0 errors, 1 warning | **0** |
| newly authored files | — | 0 | **0** |

- The 2 errors are `react-hooks/set-state-in-effect` in `usam-site.tsx`
  (lines 67 and 133), in the original site-shell `useEffect`s that read
  `matchMedia` and `localStorage` on mount. They pre-date this work and sit in
  code this pass did not touch (the footer edit is at lines ~113–124).
- The 14 `usam-site.tsx` warnings are unused lucide imports + one `<img>`
  advisory, all pre-existing.
- Net effect of this pass on lint: **0 new errors, 0 new warnings.**
- These errors existed in the deployed build (which built and ran), so they are
  not release-blocking; but they are real lint errors and are **not** described
  as "clean".

### prestart (correcting a second inaccurate statement)

An earlier note said `prestart` did not run. That was wrong. The `prestart` npm
script runs `scripts/stage-dev-vars.mjs`, which stages `~/.usam/dev.vars` into
the Miniflare config dir on `npm start`; the server startup log shows it
running. This pass touched no admin endpoints, so admin-token wiring was not
re-exercised, but `prestart` does run on every start.

## §18 test matrix

PASS = verified here with the cited evidence. NV = NOT VERIFIED (needs a
browser; manual step given). DEF = DEFERRED (needs a business/legal input).

| # | Test | Status | Evidence / how to verify |
|---|---|---|---|
| 1 | All 8 legal routes render correct content/title | PASS | All 200; distinct titles; `/sitemap` added (200) |
| 2 | Footer links from home + inner routes | PASS (HTTP) / NV (click) | Footer has all 8 legal + Cookie Settings + Your Privacy Choices + Sitemap; **click-through NV** |
| 3 | Read without JS | NV | SSR HTML contains policy text + plain `<a>` links (nav uses real anchors); confirm in a JS-disabled browser |
| 4 | EN/AR content parity (data) | PASS (data only) | `test/policy-ar-parity.test.ts`: every policy AR branch non-empty Arabic; identical section ids/order/paragraph counts EN↔AR. **Does NOT prove the live language toggle / RTL / modal / reset — those are NV (rows 5, 10, 11-live).** |
| 5 | RTL/LTR correctness | NV | `dir`/`lang` set from locale; `<bdi>` wraps dates/emails; **visual RTL not verified** — check in browser |
| 6 | 375 / 768 / desktop no overflow | NV | CSS uses responsive grids; **not measured** — check at each width |
| 7 | 200% zoom usable | NV | Relative units used; **not measured** |
| 8 | Light/dark readability | NV | Theme via CSS tokens; **dark mode not visually verified** |
| 9 | Contents anchors land below sticky header | PASS (CSS) / NV (visual) | `scroll-margin-top:96px` on sections + platform directory |
| 10 | Cookie modal open/close/Escape/focus-return/tab-trap/scroll-lock | NV | Code implements all five (focus trap, restore via `restoreFocusRef`, `body.overflow` lock, Escape, backdrop); **interaction not verified** — manual |
| 11 | Preference reset: only intended keys; no unrelated loss | PASS (logic) / NV (live) | `test/consent-reset.test.ts`: removes only `usam-locale/theme/consent`; unrelated keys preserved; never `clear()`; returns removed keys; a missing key reads as default. **The live in-browser effect (UI updates + survives reload + effects don't rewrite old prefs) is NV** — manual check 2 |
| 12 | Optional consent reject/withdraw/close≠accept | PASS (engine) | `test/consent-engine.test.ts`; no optional tech today so banner stays hidden by design |
| 13 | No optional technologies → no fake banner | PASS | `shouldShowBanner()` false when `OPTIONAL_TECHS` empty |
| 14 | Cookie dialog ↔ Ask USAM never trap focus behind each other | NV | Separate overlays; **concurrent-overlay focus not verified** — manual |
| 15 | Request submission in staging: durable ref, dup/error handling | PASS (prior) | `test/privacy-requests.test.ts`, `test/idempotency.test.ts` (unchanged this pass) |
| 16 | Staff access authorized / unauthorized denied / no client token | PASS (prior) | `test/admin-routes-auth.test.ts` (unchanged) |
| 17 | Policy version lifecycle (draft stays draft) | PASS | `/api/v1/legal/requirements` → `published:false`; `test/public-policy-redaction.test.ts` |
| 18 | Platform links: verified live, correct scope, no guessed paths | PASS | `docs/PLATFORM-LEGAL-LINKS.md`; homes 200 "Open platform"; only freelancing `/support`+`/contact` added (verified). edu/jobs/kids are home-only because their policy/support URLs are **not yet discovered/verified** (client-rendered apps — not "unavailable"); pending browser nav inspection |
| 19 | Refund claims: real support path, no unimplemented routing promise | PASS | Refunds `central-routing` states no automated hand-off; directs to platform |
| 20 | Payment content: no-checkout scope, EGP clear, no unverified claims | PASS | Payments page: EGP base, estimate caveat, provider `[FOR REVIEW]`, no badges |
| 21 | Print view includes scope/status/version | PASS (CSS present) / NV (rendering) | `@media print` block added in `app/globals.css`: hides nav/footer/cookie banner+modal/Ask USAM/ToC/action buttons/forms; keeps title, plain summary, scope/applies-to, **draft STATUS**, version (if published) and **last-updated** metadata, plus all section headings+body; prints link destinations. **Actual printed output (page breaks, paper legibility) NV** — manual check 7 |
| 22 | Regression: homepage/nav/forms/Ask USAM unchanged | PASS (HTTP) / NV (interaction) | Home 200, nav + Ask USAM markup unchanged; footer-only + legal-only edits |

### In-text structured links (gap 4) — specific evidence

- `test/inline-links.test.ts` (8 tests): known target → internal link; unknown
  target → plain text (never broken); unsafe `#anchor` dropped; multiple tokens;
  all hrefs internal/relative.
- HTTP: `/privacy` renders `<a href="/cookies">` and
  `<a href="/privacy#international-transfers">`; **policy-token leak scan = 0**
  across all 7 legal pages (the `[[` sequences present in page HTML are React's
  RSC serialization payload, not policy tokens — confirmed by matching the
  `[[label|target]]` pattern, which returns 0).

### Per-policy revision dates (gap 6) — specific evidence

- `lib/legal/policies.ts` `REVISIONS` map, each date from `git log -L` on that
  policy's own `const … : Policy` block (not a file-level log):
  privacy 2026-10-16, terms 2026-10-15, cookies 2026-10-14, refunds 2026-10-16,
  payments 2026-10-16, ai-use 2026-10-15, privacy-requests 2026-10-15.
- HTTP: `/privacy` shows 2026-10-16, `/cookies` shows 2026-10-14, `/ai-use`
  shows 2026-10-15 — i.e. genuinely distinct per policy.

## Remaining browser checks (the NOT VERIFIED rows)

None of these are reported as passed. Run on the deployed site in a real
browser, EN and AR, light and dark:

1. **Modal.** Open Cookie Settings from the footer. Tab through: focus stays
   inside the dialog and wraps; Escape closes it; focus returns to the Cookie
   Settings button; background does not scroll while open. (rows 10, 14)
2. **Live reset.** In Cookie Settings, set language to AR and theme to dark,
   then click "Reset saved preferences". Confirm the message lists only the
   stored USAM keys, unrelated site storage is untouched, and after a reload the
   site returns to default language/theme (keys gone, not immediately rewritten).
   (row 11-live)
3. **Language toggle + RTL.** Use the real language switch to العربية. Confirm
   every legal page renders Arabic headings, bodies, metadata labels, and that
   layout is RTL with sane dates/emails. (rows 4-live, 5)
4. **Responsive + zoom.** View each legal page at 375px, 768px, desktop, and at
   200% zoom: no horizontal overflow; controls reachable. (rows 6, 7)
5. **In-text links.** Click each in-text policy link (e.g. privacy → "Cookie
   Policy", "International transfers") and confirm it navigates to the right
   page/anchor below the sticky header. (row 2-click)
6. **Overlays.** Open Ask USAM and Cookie Settings in turn; confirm neither
   traps focus behind the other. (row 14)
7. **Print.** Use the browser's Print preview on `/privacy` (EN and AR): confirm
   the printout shows the title, summary, scope/applies-to, the **Draft** status,
   the last-updated date, and all sections — and that the nav/footer/cookie
   banner/Ask USAM/ToC/action buttons are omitted. (row 21-rendering)
8. **Platform nav discovery.** Open `edu.usamif.com`, `jobs.usamif.com`,
   `kids.usamif.com` and inspect the rendered navigation for privacy / terms /
   refund / support links. Record any real URLs, add verified ones to
   `PLATFORM_VERIFIED_LINKS`, and update `docs/PLATFORM-LEGAL-LINKS.md`. (row 18
   follow-up — these are "not yet discovered/verified", not "unavailable")

## Readiness for final publication — assessed PER POLICY

An unresolved fact is **not** automatically "non-blocking". For each policy, any
fact that affects that policy's **accuracy** must be **verified, accurately
qualified (as draft/pending with a neutral note), or removed** before that
policy is approved. The pages ship today as readable, clearly-labelled drafts
*because* the unresolved facts are currently qualified/redacted — not because
they are deemed harmless. Below is the per-policy state and what each policy
needs before it is accurate enough to approve.

| Policy | Approve-blocking unresolved facts (must be verified/qualified/removed) | Current handling |
|---|---|---|
| **privacy** | Operator identity (B1–B5); lawful basis (L1); retention periods (L2); international-transfer *basis* (L3). | Identity rendered from placeholders; basis/retention are `pending` sections showing a neutral note; transfer *location* stated as verified fact, *basis* redacted. Accurate as draft. |
| **terms** | Operator identity (B1–B5); governing law & venue (L4). | Operator stated as trading name "USAM"; governing-law clause marked `[FOR REVIEW]`/redacted. Accurate as draft. |
| **cookies** | None outstanding that affect accuracy. | Storage inventory matches code (`usam-locale/theme/consent`); "no optional trackers" matches an empty `OPTIONAL_TECHS`. Could be approvable on its own once reviewed. |
| **ai-use** | None factual outstanding; describes the local matcher accurately. | Matches `lib/guide-intent` behavior (local, no external model). Approvable on its own once reviewed. |
| **payments** | Payment provider / PSP per platform (T-ext). | Provider marked `[FOR REVIEW]`/redacted; no checkout exists on Master (verified). The *provider* claim is withheld, so the page is accurate as draft. |
| **refunds** | Per-platform refund policy/eligibility (platform-owned). | States no automated hand-off (matches outbox reality); directs to the platform. Accurate as draft. |
| **privacy-requests** | Monitored privacy mailbox (B5); fulfilment timeframes (L2-adjacent). | Receipt-≠-fulfilment stated; timeframes marked still-being-finalized. Accurate as draft. |

So **cookies** and **ai-use** have no accuracy-blocking gaps; **privacy**,
**terms**, **payments**, **refunds**, **privacy-requests** each have specific
blockers listed above. Approval is per policy, not all-or-nothing.

## Outstanding items, separated by who resolves them

### A. Business facts the owner must supply (cannot be inspected or invented)

- **B1** Registered English legal entity name (Egyptian LLC)
- **B2** Registered Arabic legal entity name
- **B3** Registered address
- **B4** Commercial registration number (decide whether to publish)
- **B5** A monitored privacy email address (that it exists and is watched)

### B. Legal decisions requiring review (counsel)

- **L1** Lawful basis per processing purpose (Egypt PDPL 151/2020; Saudi PDPL)
- **L2** Retention periods per data category + legal retention exceptions
- **L3** International-transfer basis/safeguard to the EU (the hosting *location*
  is a verified technical fact — see T2 — but the lawful *mechanism* is a legal
  determination)
- **L4** Governing law and dispute venue for the Terms

### C. Technical facts I can/should verify (do NOT ask the owner for these)

These are determinable from the repositories, configuration, or authorized
infrastructure access. Where access is missing, the exact evidence needed is
named — I will not invent the answer.

- **T1 — Notification delivery status.** *Inspectable from config.*
  `lib/api/outbox-worker.ts` resolves the channel from env
  `USAM_LEAD_NOTIFY_WEBHOOK` / `USAM_LEAD_NOTIFY_EMAIL`; with neither set the
  worker reports `disabled` and events stay `pending`. **Evidence needed to
  state production status:** read the running service environment on the host
  (`/home/ubuntu/usam` systemd env + `dist/server/.dev.vars`) for those two
  variable names. If present → delivery is configured; if absent → not
  configured. (The code default and the contact form's `not_configured` path
  already indicate "not configured"; confirm against the live env before
  asserting it in a policy.)
- **T2 — Hosting location.** *Verified earlier via authorized infra access:*
  AWS EC2 `eu-north-1` (Stockholm). This is the verified fact behind the privacy
  "International transfers" location statement. Re-confirm with
  `curl -s http://169.254.169.254/latest/meta-data/placement/region` on the host
  if a fresh citation is wanted.
- **T3 — Inbound email routing.** *Verified earlier:* domain MX → Google
  (`SMTP.GOOGLE.com`), i.e. Google Workspace handles inbound mail. Re-confirm
  with `dig +short MX usamif.com`. (Note: this is routing only; whether a
  specific **privacy mailbox** is monitored is business fact B5, not technical.)
- **T4 — Automated backup coverage.** *Not yet determinable from the repo.* No
  backup job exists in the codebase (only a one-off manual snapshot was taken).
  **Evidence needed:** on the host/AWS account, check for an automated backup of
  the SQLite/D1 state — e.g. a cron entry (`crontab -l`, `/etc/cron.*`), a
  systemd timer, or an AWS Backup/snapshot plan for the instance/volume. Until
  that evidence is seen, the privacy notice must keep its current `[FOR REVIEW]`
  qualification and **not** claim automated backups.
- **T5 — Payment provider / PSP per selling platform.** *Not in this repo* (the
  Master has no checkout). **Evidence needed:** the configured PSP from each
  platform repository's checkout/payment config, or a statement from each
  platform owner. Until verified, the payments page keeps the provider marked
  `[FOR REVIEW]` and makes no provider/security claim.
- **T6 — Platform policy/support URLs (edu/jobs/kids).** *Not server-visible*
  (client-rendered apps). **Evidence needed:** inspect each platform's rendered
  navigation in a browser (QA checklist item 8) and record the real URLs, or
  obtain them from each platform owner. Status is "not yet discovered/verified",
  not "unavailable".

### D. Browser acceptance checks (pending)

The visual/interaction rows above (NV) — modal, live reset, language toggle +
RTL, responsive + zoom, in-text link navigation, overlay focus, print preview,
and platform-nav discovery. None are reported as passed. See the checklist.

_The print stylesheet (previously listed as deferred) is implemented; its visual
rendering is NOT VERIFIED and is in the browser checklist (check 7)._
