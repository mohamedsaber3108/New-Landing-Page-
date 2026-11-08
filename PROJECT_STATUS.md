# USAM Master — Project Status & Handover

**Last updated:** 2026-10-20
**Deployed production commit:** `9346c97c32134f7f8c03571ab0fdf047886bf40f` (= `origin/main` = server `HEAD`)
**Rollback target (previous production):** `27009f0`
**Live site:** https://usamif.com

This file is the single source of truth for resuming work. It is written to be
usable without the chat history. Items are explicitly marked **Completed**,
**Pending**, or **Unverified** — do not treat Pending/Unverified as done.

---

## 1. Project overview & architecture

USAM Master is the **discovery / enquiry front-door** website for the USAM
ecosystem (`usamif.com`). It introduces four separate product platforms and
routes users to them. It does **not** sell, take payment, or hold user accounts
— those live on the platforms.

- **Framework:** Vinext (Vite 8 + a Next-like app router) running as a
  **Cloudflare Worker**, React 19, TypeScript.
- **Runtime in production:** `wrangler dev --local` (Miniflare) under a systemd
  service `usam` on EC2 (`ip-172-31-17-101`, `/home/ubuntu/usam`,
  `ExecStart=/usr/bin/npm start -- --port 8787`), fronted by nginx.
  Miniflare does **not** inherit systemd env; see §7 for the secret-staging path.
- **Data:** D1 (SQLite) via Drizzle ORM. Local Miniflare SQLite state lives at
  `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`
  (the real DB file is the long-hash one, NOT `metadata.sqlite`).
- **Hosting fact (verified earlier):** AWS EC2 `eu-north-1` (Stockholm).
- **Inbound email (verified earlier):** domain MX → Google Workspace.
- **Build:** `npm run build` (→ `node scripts/run-framework.mjs build`).
- **Tests:** `npx vitest run` (Node env; 104 tests across 14 files).

### Key directories / files
- `app/` — routes. `app/[...slug]/page.tsx` renders every informational/legal
  route via `components/usam-site.tsx` (`USAMSite`). `app/api/v1/**` — API routes.
- `components/usam-site.tsx` — the whole site shell (nav, mega-menus, footer,
  locale/theme state + persistence, mounts Ask USAM + Cookie modals).
- `components/legal-content.tsx` — Legal Center + individual policy pages.
- `components/page-content.tsx` — informational page bodies + human `/sitemap`.
- `components/cookie-consent.tsx` — cookie banner + Cookie Settings modal + reset.
- `components/legal-acceptance.tsx` — shared form acceptance/notice block.
- `components/privacy-request-form.tsx`, `components/contact-lead-form.tsx`,
  `components/enquiry-form.tsx` — forms.
- `lib/legal/policies.ts` — **single source of truth for all 8 legal policies**
  (EN+AR content, per-policy revision dates).
- `lib/legal/store.ts` — `publicPolicyView` (public projection), publish/override
  logic, `getPolicyRequirement` (drives acceptance gating).
- `lib/legal/inline-links.ts` — safe `[[label|target]]` in-text link parser.
- `lib/api/admin-auth.ts` — admin gate (reads the **`x-admin-token`** header).
- `lib/api/leads.ts`, `lib/api/outbox-worker.ts`, `lib/api/content.ts` — enquiry
  persistence, transactional-outbox notification worker, public content API.
- `db/schema.ts` — Drizzle schema (`enquiries`, `privacy_requests`,
  `consent_events`, `outbox_events`, `policy_publications`, `idempotency_keys`).
- `data/products.ts` — products + the `routes` registry (every public route).
- `scripts/stage-dev-vars.mjs` — `prestart` hook; stages secrets into Miniflare.
- `docs/` — all handover documentation (see §6).

---

## 2. Completed features (verified)

- **Legal subsystem (8 policies):** `/legal`, `/privacy`, `/terms`, `/cookies`,
  `/refunds`, `/payments`, `/ai-use`, `/privacy-requests` — full bilingual
  (EN+AR) content, Legal Center index, in-text cross-links, per-policy genuine
  revision dates, related-policy links, contextual actions.
- **No public draft/review messaging** (as of `27009f0`/`9346c97`): all
  Draft/Preview/Under-Review/"being finalized" banners, badges, status rows and
  equivalent Arabic wording were removed site-wide. Policies render as plain
  content. The internal `approval` lifecycle string is **not** serialized into
  public output (the public API exposes only a `published` boolean). Verified:
  0 draft/review hits across all 8 pages (EN+AR); unit test
  `test/public-policy-redaction.test.ts` enforces this.
- **Cookie consent + Settings modal:** documented storage inventory
  (`usam-locale`, `usam-theme`, `usam-consent`), scoped "Reset saved
  preferences" (allowlist only, never `localStorage.clear()`), focus trap,
  Escape, scroll-lock, focus-return — all verified in a real browser.
- **Ask USAM** guide drawer (local intent matcher, no external model).
- **Human `/sitemap`** + machine `sitemap.xml`.
- **Forms:** Contact / Enterprise / Government / Privacy-Request — server
  validation, idempotency (duplicate protection), durable persistence,
  reference receipts; marketing opt-in separate + unchecked; privacy notice
  (no forced Terms checkbox while Terms are unpublished).
- **Admin/staff endpoints:** `GET /api/v1/admin/leads`,
  `GET/PATCH /api/v1/admin/privacy-requests`, `GET /api/v1/admin/consent`,
  `POST /api/v1/admin/outbox/process` — gated by `x-admin-token`, fail closed.
- **Print stylesheet** for legal pages (`@media print` in `app/globals.css`).

- **Official contact details (2026-11-08):** address `Masr El Gedida, Cairo,
  Egypt` (AR: `مصر الجديدة، القاهرة، مصر`) and email `support@usamif.com`.
  Single source: `lib/site-contact.ts`. Rendered by `components/contact-info.tsx`
  in the footer (`.footer-contact`, `components/usam-site.tsx`), the Contact page
  card (`#contact-details`, `components/page-content.tsx`) and the Legal Center.
  Policy text updated in `lib/legal/policies.ts` (privacy, terms, refunds,
  payments incl. new "Payment questions and complaints" section, privacy-requests)
  and the Pricing page. Guard test: `test/site-contact.test.ts`. To change a
  detail, edit `lib/site-contact.ts` only. Note: this address/email is described
  as USAM's *contact* details — NOT as a registered legal address or a dedicated
  monitored privacy mailbox (those business facts are still pending, see §4).
  Verified in a real browser (EN/AR, desktop/mobile): renders, mirrors in RTL,
  no overflow. **Not yet deployed** until the §7 deploy block is run.

### Defect fixed in this session
- **Reset-saved-preferences re-persisted defaults on reload.** Root cause:
  `USAMSite` wrote `usam-locale`/`usam-theme` on every mount once `ready`, so a
  reset was immediately overwritten and a never-chosen visitor got storage
  written. **Fixed** in `components/usam-site.tsx` by a `userChose` ref — persist
  only after an explicit choice; the document still always reflects locale/theme.
  Commit `19daa5c` (merged `9346c97`). Verified live: explicit choice persists;
  reset now stays cleared after reload; unrelated storage preserved.

---

## 3. Current development status

**The implementation + acceptance effort for the legal/privacy subsystem and the
site-wide draft-label cleanup is COMPLETE and deployed at `9346c97`.** The last
code change was the reset-persistence fix. The final work in this session was
**verification only** (full browser acceptance pass) + this documentation/handover.

Browser acceptance (Playwright/Chromium against live, 2026-10-20) — all measured
checks PASS. Evidence preserved in `docs/acceptance/` (script, results JSON,
exported PDF). See §5 for the precise scope limits.

---

## 4. Pending tasks / remaining requirements

These are **not code bugs** — they are inputs/decisions and optional ops config.
Do not invent them; do not reintroduce public draft banners to cover for them.

### Business facts the owner must supply (blocking FINAL legal publication)
- Registered legal entity name (EN + AR), registered address, commercial
  registration number.
- A monitored privacy email address (optional to name — the Privacy Requests
  form is the working channel if no mailbox is published).
  **Impact:** until supplied, policies accurately describe current operation but
  omit a named operator/registration. They should not be declared the final,
  approved legal terms.

### Legal decisions requiring counsel (blocking FINAL publication of those clauses)
- Lawful basis per processing purpose; retention periods per data category;
  international-transfer legal basis; governing law & dispute venue.
  **Impact:** the privacy/terms pages currently describe practice in plain
  language without asserting these specifics. They are accurate as operating
  descriptions but are **not** a completed legal compliance statement.

### Platform / operational
- Per-platform payment provider (PSP), refund windows, Kids age/guardian rules —
  owned by each platform; the Master pages correctly defer to the platforms.
- **Automated backup coverage (AWS side): UNKNOWN / unverified.** No backup job
  exists in this repo; only a manual snapshot was ever taken. **Impact:** there
  is no confirmed automated backup of production enquiry/privacy-request data —
  a real operational risk to resolve, not merely "optional." The privacy notice
  makes no backup claim (correct).
- **Notification delivery is stored-only by design.** No `USAM_LEAD_NOTIFY_*`
  env is configured, so enquiry/outbox events persist as `pending` and **no
  email/webhook alert is sent**. **Impact:** staff must poll the admin queues
  (see runbook) — submissions are never lost, but nobody is actively notified.
  To enable delivery, set `USAM_LEAD_NOTIFY_WEBHOOK` or `USAM_LEAD_NOTIFY_EMAIL`
  (email path is a documented integration point, needs a provider).

---

## 5. Known issues, limitations & unverified items

- **Native 200% browser zoom: UNVERIFIED.** The acceptance check used a CSS
  `zoom:2` approximation (no horizontal overflow). Native browser zoom was not
  measured.
- **Print/PDF: export verified, visual page-breaks NOT inspected.** The exported
  `docs/acceptance/privacy-print-preview.pdf` (47 KB, 9 sections, nav/footer/ToC
  hidden) confirms chrome is hidden and content is present. The rendered pages
  were **not** visually inspected, so "no clipping / sensible page breaks" is
  **not** claimed.
- **Contrast** measured on representative elements only (legal body/summary/meta/
  h1/in-text-link, form label, primary button, cookie text) in both themes — all
  ≥ WCAG AA 4.5:1 (light min 7.66, dark min 8.17). Not every component audited.
- **Pre-existing lint in `components/usam-site.tsx`:** 2 errors
  (`react-hooks/set-state-in-effect`, lines ~67/133) + 14 warnings (unused
  lucide imports, one `<img>` advisory). These pre-date this engagement and were
  **not** introduced by it; the build passes regardless. Left as-is (out of
  scope). `npx eslint` therefore exits non-zero — this is expected, not a
  regression.
- **`docs/OLD-TO-NEW-URL-MAP.md`** is an untracked file concerning old-URL
  preservation. It is intentionally **left untouched / uncommitted** per owner
  instruction — do not delete or commit it without asking.
- Removing draft notices did **not** make the policies "legally compliant." It
  removed unfinished-status messaging. Final compliance depends on §4 inputs.

---

## 6. Important decisions, configurations & existing docs

- **Public policy wording must describe only services/processes actually
  operating.** Never invent company details, legal bases, retention periods,
  payment providers, security certifications, or backup coverage. Never restore
  public draft/review banners to paper over a missing fact — omit or rephrase.
- **Approval/versioning is internal.** `lib/legal/store.ts` keeps an `approval`
  lifecycle; the public API exposes only `published:boolean`. Do not flip
  policies to `published` just to change UI — publishing Terms activates a
  required acceptance checkbox and records acceptance. Keep it a deliberate
  admin action.
- **Admin auth header is `x-admin-token`** (NOT `Authorization: Bearer`). See
  `lib/api/admin-auth.ts`. Fails closed (403 if unset, 401 if wrong).
- Existing handover docs in `docs/`:
  - `LEGAL-QA-REPORT.md` — QA matrix + evidence (status: deployed; browser
    checks were pending at the time of writing, now completed — see
    `docs/acceptance/`).
  - `PLATFORM-LEGAL-LINKS.md` — platform link verification register.
  - `USAM-legal-deploy-runbook.md` — deploy/rollback procedure.
  - `USAM-legal-operational-handoff.md`, `USAM-gap-matrix.md`,
    `USAM-backend-api.md`, `USAM-legal-implementation-report.md`,
    `USAM-legal-cross-platform-contract.md`, `USAM-legal-policy-drafts.md`.
  - `docs/acceptance/` (NEW this session) — browser acceptance script
    (`acceptance-browser-checks.cjs`), results (`acceptance-results.json`),
    exported PDF (`privacy-print-preview.pdf`).
- **Staff runbook** (secure `x-admin-token` use, viewing queues, stored-only
  notifications) is below in §8.

---

## 7. Deploy / secret-staging / data (operational facts)

- **Deploy (established safe workflow), run on the EC2 host:**
  ```bash
  cd /home/ubuntu/usam
  git fetch origin && git log -1 --oneline origin/main
  git pull --ff-only origin main
  rm -rf dist .vinext && npm ci && npm run build
  sudo systemctl restart usam
  # Miniflare takes ~10-20s to boot; a 502 immediately after restart is the
  # boot window, not a failure — wait ~20s, then: curl -I https://usamif.com/
  ```
  **Rollback:** `git reset --hard 27009f0 && rm -rf dist .vinext && npm ci && npm run build && sudo systemctl restart usam`
- **No DB migration pending.** Migration `0004` (consent_events,
  privacy_requests, policy_publications) is already applied. Do not re-run
  applied migrations.
- **Secret staging:** `prestart` runs `scripts/stage-dev-vars.mjs`, copying
  `~/.usam/dev.vars` (stable, gitignored) → `dist/server/.dev.vars` so Miniflare
  sees `USAM_ADMIN_TOKEN` etc. `dist/` is wiped each deploy, which is why the
  copy happens at launch.
- **`USAM_ADMIN_TOKEN`** is set in `~/.usam/dev.vars` on the server (confirmed
  working: admin endpoints return 200 with the correct `x-admin-token` header).

---

## 8. Staff runbook — admin queues & notifications

> Never paste the token or any personal enquiry data into chat, tickets, or
> screenshots. The token is a shared secret; keep it in a password manager.

**Authenticate with the `x-admin-token` header** (NOT `Authorization: Bearer`).
Run from a trusted machine/terminal, reading the token from the server's secrets
file so it is never typed inline:

```bash
# on the EC2 host
TOKEN="$(grep -E '^USAM_ADMIN_TOKEN=' /home/ubuntu/.usam/dev.vars | cut -d= -f2-)"

# View enquiries (Contact/Enterprise/Government). Optional filters: ?kind=enterprise  ?limit=1..200
curl -s https://usamif.com/api/v1/admin/leads -H "x-admin-token: $TOKEN"

# View privacy/data-subject requests
curl -s https://usamif.com/api/v1/admin/privacy-requests -H "x-admin-token: $TOKEN"

# Advance a privacy request's status (identity must be verified before fulfilment):
#   PATCH with { "id": <n>, "status": "identity_verification" | "verified" | ... }
curl -s -X PATCH https://usamif.com/api/v1/admin/privacy-requests \
  -H "x-admin-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id": 1, "status": "identity_verification"}'

unset TOKEN
```

- A missing/invalid token returns **401/403** (fails closed) — that is correct.
- **Notifications are stored-only right now:** submissions persist and appear in
  the admin queues above, but **no alert is emailed/posted anywhere**. Staff
  must check the queues periodically. Do not tell users an alert was sent.
- To enable delivery later: set `USAM_LEAD_NOTIFY_WEBHOOK` (or
  `USAM_LEAD_NOTIFY_EMAIL`) in `~/.usam/dev.vars` and restart; the outbox worker
  (`lib/api/outbox-worker.ts`) then delivers `pending` events with retries.

---

## 9. Exact last completed step

1. Removed all public draft/review messaging site-wide; policies render as plain
   verified content (`27009f0`, deployed).
2. Found + fixed the reset-saved-preferences-reload defect
   (`19daa5c` → merged `9346c97`, deployed & verified live).
3. Resolved the staff-access investigation: the admin API was returning 401
   because verification used the wrong header; the correct header is
   `x-admin-token`. Confirmed live (leads + privacy-requests → 200; wrong/no/
   Bearer → 401). No credential rotation needed.
4. Verified live idempotency/duplicate protection by replaying the same
   `Idempotency-Key` (same reference, one row, cleaned up).
5. Completed the full browser acceptance pass (Playwright/Chromium) with the two
   evidence corrections (native zoom unverified; PDF export only). Preserved
   artifacts in `docs/acceptance/`.
6. **This step:** wrote `PROJECT_STATUS.md`; committing docs + acceptance
   artifacts and pushing to `origin/main`.

---

## 10. Next steps — recommended starting point

Open the repo, read this file + `docs/LEGAL-QA-REPORT.md` + `docs/acceptance/`.
Production is stable at `9346c97`; **make no code change unless a reproducible
defect is found.** Then, in priority order:

1. **Resolve the backup-coverage unknown (§4):** confirm whether production
   enquiry/privacy-request data is backed up (AWS/cron/snapshot). This is a real
   data-durability risk, not optional.
2. **Collect the business + legal inputs (§4)** needed to move policies from
   "accurate operating description" to formally approved, published terms. Only
   then flip the relevant policy to `published` via the admin publish flow (do
   not hardcode it).
3. **Decide on notification delivery (§8):** keep stored-only (staff poll) or
   configure `USAM_LEAD_NOTIFY_*`.
4. If reopening the browser acceptance: the isolated Playwright harness lives in
   a temp dir (periodically swept) — re-create with
   `npm i playwright@latest && npx playwright install chromium`, then run
   `docs/acceptance/acceptance-browser-checks.cjs` (it is CommonJS `.cjs` because
   the repo `package.json` is `type: module`). Native 200% zoom + PDF visual
   page-break review are the only acceptance items still outstanding.

**Do not:** reintroduce public draft/review banners; invent business/legal
facts; flip `approval` to bypass versioning; delete or commit
`docs/OLD-TO-NEW-URL-MAP.md` without asking; re-run applied DB migrations;
change DNS/email.
