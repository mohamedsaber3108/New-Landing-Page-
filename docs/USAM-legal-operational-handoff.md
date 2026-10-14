# USAM Master — Legal/Consent Operational Handoff

Deployed and stable: `main` @ `bad59f9`, migration 0004 applied, all legal
surfaces live, policies correctly redacted until approved. This document is the
operations hand-off — no further deployment is implied by anything here.

---

## 1. Business-information checklist (only what is still missing)

Everything below is what must be **confirmed by you / legal** before policies can
be published. Already-verified facts are listed first so they are not re-asked.

### Already verified — reuse as-is (do NOT re-collect)
- Master role: discovery/enquiry portal; **no checkout, no payment, no account**.
- Base currency for USAM-owned pricing: **EGP**.
- Platforms + destinations: Education `edu.usamif.com`, Career `jobs.usamif.com`,
  Freelancing `freelancing-platform.usamif.com`, Kids `kids.usamif.com`.
- Payment provider named for platforms: **Bank of Alexandria** (platform-side;
  credentials to be supplied separately — not configured, not claimed here).
- Trackers on the Master: **none** (only necessary/functional local storage).
- Applicable frameworks (verified from official sources):
  Egypt PDPL Law 151/2020 + Executive Regs (Decree 816/2025), full-compliance
  **31 Oct 2026**, supervised by **PDPC**; KSA PDPL (Royal Decree M/19, amended
  M/148), fully enforceable **14 Sep 2024**, authority **SDAIA**.

### MASTER-SITE — still required (blocks publishing Master policies)
1. [ ] Registered **legal entity name** operating usamif.com.
2. [ ] Registered **business address**.
3. [ ] **Privacy/DPO contact email** (and officer name/title if one is designated).
4. [ ] **Lawful basis** per purpose (enquiry handling, preference storage,
       consent-evidence retention) under Egypt + KSA frameworks.
5. [ ] **Retention periods**: enquiries, consent-evidence events, privacy
       requests (how long each is kept, and the deletion trigger).
6. [ ] **Governing law & dispute venue** for the Terms.
7. [ ] Which **data-subject rights** apply (access/correction/deletion/withdraw)
       and any legal retention exceptions, per jurisdiction.
8. [ ] **Processor inventory + international-transfer** basis for the hosting /
       infrastructure the Master uses (names + transfer safeguard).

### PLATFORM-SPECIFIC — required on each selling platform, NOT the Master
(The Master only links out; these are confirmed/published on the platforms.)
9.  [ ] **Refund/cancellation** eligibility windows + processing timeframes, per
        offering (subscription / course / service / booking / marketplace).
10. [ ] **Payment provider capabilities** actually enabled (hosted checkout vs
        tokenized fields; refund/void support) — Bank of Alexandria specifics.
11. [ ] **Kids** age threshold + guardian-consent mechanics + parent notice.
12. [ ] Platform **processor/transfer/AI** disclosures (recruitment data for
        Career, marketplace data for Freelancing, learning data for Education).

> Do not invent any of items 1–12. Until 1–8 are resolved, Master policies stay
> in "being finalized" state publicly. Items 9–12 are tracked in
> `docs/USAM-legal-cross-platform-contract.md`.

---

## 2. Policy drafts for review (EN + AR)

The complete bilingual drafts of all seven Master policies are provided two ways,
and **neither publishes anything**:

- **Downloadable file:** `docs/USAM-legal-policy-drafts.md` (generated from the
  source of truth `lib/legal/policies.ts`). Regenerate anytime after editing the
  source with:
  ```bash
  node --experimental-strip-types scripts/export-policy-drafts.mjs > docs/USAM-legal-policy-drafts.md
  ```
- **Protected in-situ preview** (requires the admin token — see §3). Returns the
  true draft text per locale, exactly as it would read once published:
  ```bash
  curl -s -H "x-admin-token: $USAM_ADMIN_TOKEN" \
    "https://usamif.com/api/v1/admin/policies?type=privacy&preview=1&locale=en"
  curl -s -H "x-admin-token: $USAM_ADMIN_TOKEN" \
    "https://usamif.com/api/v1/admin/policies?type=privacy&preview=1&locale=ar"
  ```
  Valid `type` values: `privacy terms cookies refunds payments ai-use
  privacy-requests`.

Each draft states the Master's discovery/enquiry role explicitly (e.g. Terms:
"USAM Master is a discovery and enquiry portal… it does not sell products,
process payments, or create a user account"; Payments: "payment happens on the
platform… we do not ask for, receive, or store card numbers").

Review workflow: edit wording in `lib/legal/policies.ts` (or supply final text),
re-export, get legal sign-off, then publish via §3. Placeholders of the form
`[REQUIRES LEGAL REVIEW: …]` mark the exact spots needing the §1 facts.

---

## 3. Admin runbook (API-only — there is NO dashboard UI)

> **Administration is a set of token-gated HTTP endpoints, not a web dashboard.**
> There is no admin login page or UI. Staff call these endpoints with a tool that
> can send an `x-admin-token` header (curl, Postman, an internal script). Every
> admin route **fails closed with 403 when no token is configured** (current
> state).

### 3.1 Set `USAM_ADMIN_TOKEN` securely (systemd drop-in)
The token must never appear in frontend code, URLs, Git, logs, or chat. Put it in
a root-only systemd drop-in and restart the service.

```bash
# Generate a strong token WITHOUT printing it to the terminal/log, write it
# straight into a root-only drop-in file.
sudo install -d -m 700 /etc/systemd/system/usam.service.d
umask 077
printf '[Service]\nEnvironment=USAM_ADMIN_TOKEN=%s\n' "$(openssl rand -hex 32)" \
  | sudo tee /etc/systemd/system/usam.service.d/admin-token.conf >/dev/null
sudo chmod 600 /etc/systemd/system/usam.service.d/admin-token.conf
sudo systemctl daemon-reload
sudo systemctl restart usam
```

To retrieve the token later for your own admin calls (shown only to you in your
shell, never committed) — read it from the root-only file:
```bash
sudo sed -n 's/^Environment=USAM_ADMIN_TOKEN=//p' /etc/systemd/system/usam.service.d/admin-token.conf
```
Prefer exporting it into your shell for the session rather than pasting it inline:
```bash
read -rs USAM_ADMIN_TOKEN   # paste the token at the silent prompt, then Enter
export USAM_ADMIN_TOKEN
```

Rotate by rewriting the drop-in with a new `openssl rand` value and restarting.
Revoke by deleting the drop-in and restarting (all admin endpoints return 403).

### 3.2 Confirm authenticated access works
```bash
# Expect HTTP 200 now that the token is set (was 403 before).
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "x-admin-token: $USAM_ADMIN_TOKEN" "https://usamif.com/api/v1/admin/policies"
```

### 3.3 Review enquiries (the staff inbox)
```bash
# All enquiries incl. anonymous enterprise/government submissions.
curl -s -H "x-admin-token: $USAM_ADMIN_TOKEN" \
  "https://usamif.com/api/v1/admin/leads?limit=50" | jq .
# Filter by kind: general | product-help | partnership | government | enterprise
curl -s -H "x-admin-token: $USAM_ADMIN_TOKEN" \
  "https://usamif.com/api/v1/admin/leads?kind=enterprise" | jq .
```

### 3.4 Review + progress privacy requests (identity-gated)
```bash
# Queue
curl -s -H "x-admin-token: $USAM_ADMIN_TOKEN" \
  "https://usamif.com/api/v1/admin/privacy-requests?status=received" | jq .

# Advance a request (state machine enforces legal order):
#   received → identity_verification → in_review → action_in_progress → completed
#   (rejected is allowed from any non-terminal state)
# A sensitive request (access/correction/deletion) CANNOT reach
# action_in_progress/completed until identityVerified=true.
curl -s -X PATCH -H "x-admin-token: $USAM_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  "https://usamif.com/api/v1/admin/privacy-requests" \
  -d '{"reference":"PRQ-XXXXXX","status":"identity_verification","assignedTo":"you@team"}'

curl -s -X PATCH -H "x-admin-token: $USAM_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  "https://usamif.com/api/v1/admin/privacy-requests" \
  -d '{"reference":"PRQ-XXXXXX","identityVerified":true,"status":"in_review"}'

curl -s -X PATCH -H "x-admin-token: $USAM_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  "https://usamif.com/api/v1/admin/privacy-requests" \
  -d '{"reference":"PRQ-XXXXXX","status":"completed","staffNote":"Access package sent securely."}'
```
Invalid transitions return 409; acting on a sensitive request while unverified
returns 422. Fulfilment (retrieving/deleting the person's data) is performed by
staff out of band — the endpoint tracks and gates the workflow, it does not
auto-disclose data.

### 3.5 Review consent evidence
```bash
# Aggregate coverage (counts by event type/status and by policy version)
curl -s -H "x-admin-token: $USAM_ADMIN_TOKEN" \
  "https://usamif.com/api/v1/admin/consent" | jq .
# Evidence tied to one enquiry reference
curl -s -H "x-admin-token: $USAM_ADMIN_TOKEN" \
  "https://usamif.com/api/v1/admin/consent?ref=USAM-XXXXXX" | jq .
```

### 3.6 Publish an approved bilingual policy release
Publishing is what flips a policy from the public "being finalized" notice to
live text. **Both `en` and `ar` must be published at the SAME `version`** — the
site only treats a policy as published when the two locales match, so publish
them as a pair. Previous versions are retained (never overwritten).

```bash
# 1. Review the exact draft text first (preview, §2).
# 2. Publish EN, then AR, at the SAME version string.
curl -s -X POST -H "x-admin-token: $USAM_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  "https://usamif.com/api/v1/admin/policies" \
  -d '{"policyType":"privacy","locale":"en","version":"2026-11-approved-1","effectiveAt":"2026-11-01","materialChange":true}'

curl -s -X POST -H "x-admin-token: $USAM_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  "https://usamif.com/api/v1/admin/policies" \
  -d '{"policyType":"privacy","locale":"ar","version":"2026-11-approved-1","effectiveAt":"2026-11-01","materialChange":true}'

# 3. Verify it is now public and consistent.
curl -s "https://usamif.com/api/v1/legal/privacy?locale=en" | jq '.data.approval,.data.version'
curl -s "https://usamif.com/api/v1/legal/requirements" | jq .
```
Notes:
- If you omit `content`, the publish uses the **current baseline wording** in
  `lib/legal/policies.ts` under the new version/effective date. To publish
  edited wording, include a `content` object (localized title/scope/appliesTo/
  sections) — but the simplest path is to finalize wording in the source, deploy,
  then publish version+date only.
- Publishing Terms (and Privacy) at a consistent version is also what turns ON
  the required Terms checkbox in the enquiry forms (via
  `/api/v1/legal/requirements`). Until then, forms stay usable with a notice.
- Version history: `GET /api/v1/admin/policies?type=privacy` shows all retained
  versions; `?preview=1&locale=` shows the full text of any.

### 3.7 Verify a URL cannot be used to leak the token
The token is a request **header**, never a query parameter. Do not place it in a
URL (URLs land in logs/history). The provided commands all use `-H`.

---

## 4. Notifications — what delivery actually requires

**Inspected from the code (`lib/api/outbox-worker.ts`,
`app/api/v1/admin/outbox/process/route.ts`). Setting an env var alone does NOT
deliver anything.** Here is the real picture:

### How it works today
- Each enquiry/privacy-request writes a `lead.created` /
  `privacy_request.created` row into `outbox_events` in the same transaction —
  so events are durably captured and **never lost**, even with no channel.
- Delivery is done by `processOutboxBatch()`, which is **not scheduled**. It runs
  only when something calls it:
  - `POST /api/v1/admin/outbox/process` (admin-token gated), or
  - a future Cloudflare Cron/Queue consumer (not wired).
- Channel resolution (`resolveChannel`):
  - `USAM_LEAD_NOTIFY_WEBHOOK` set → **webhook** delivery is **implemented**:
    POSTs the event JSON, with bounded retries (max 5 attempts), exponential
    backoff (2→4→8→16→32s, capped 300s), and **dead-letter** after 5 failures.
  - `USAM_LEAD_NOTIFY_EMAIL` set → currently returns **`disabled`**: email is a
    documented integration point, **not implemented** (needs an approved
    provider + credentials). Setting the email var does nothing until a provider
    is wired in code.
  - neither set → `disabled`, events stay `pending`.

### So, to actually deliver, you need THREE things
1. **A destination/provider decision** (this is the one thing I need from you):
   - Option A — **Webhook** (works today): a URL that receives a JSON POST per
     event (e.g. a Slack/Teams incoming webhook, a Zapier/Make hook, or your own
     CRM endpoint). Fastest path, no code change.
   - Option B — **Email**: requires choosing a provider (e.g. a transactional
     email API) and a **code integration** in `outbox-worker.ts` — a gated task,
     not just configuration.
2. **Configuration** of the chosen channel (for a webhook, the URL as an env var
   via the same systemd drop-in pattern as the admin token).
3. **A trigger** so events are actually drained — either call the admin
   process endpoint on a schedule (e.g. a cron on the box) or wire a Cloudflare
   Cron/Queue. Without a trigger, even a configured webhook won't fire.

### Failure visibility
- `GET /api/v1/admin/outbox/process` returns a summary per run: `claimed`,
  `delivered`, `failed`, `deadLettered`, and `status` (`disabled`/`ran`).
- `outbox_events` rows carry `status` (pending/delivering/delivered/failed/
  dead_letter), `attempts`, `lastError`, `nextAttemptAt` — queryable for
  stuck/dead events.

### What I need from you, then I'll wire + verify
> **Tell me the destination:** a **webhook URL** (Option A, recommended for a
> working test today) or that you want **email** (Option B, which I'll scope as a
> provider-integration task). Once you give me a webhook URL, I will: configure
> it via the drop-in, trigger one real test event end-to-end
> (`POST /api/v1/admin/outbox/process`), and confirm `delivered: 1` with the
> event showing `delivered` — a single verified real notification. I will not
> claim delivery works until that test passes.

---

## 5. Browser verification checklist

**Already verified over HTTP (done):** all legal routes return 200; the public
legal API redacts drafts (`approval:draft`, zero placeholders); requirements
report `published:false`; a privacy request returns a `PRQ-` receipt; a contact
enquiry returns a `USAM-` reference; admin endpoints return 403 without a token.

**Still needs a human in a real browser (NOT yet verified — no browser tooling
was available):**

Open each URL and check the interaction noted.

| URL | Check (browser interaction) |
|---|---|
| https://usamif.com/legal | Legal Center lists all 7 policies; each card links through |
| https://usamif.com/privacy | Shows the "being finalized" notice (not draft body); readable |
| https://usamif.com/terms | Same; discovery/enquiry framing once published |
| https://usamif.com/cookies | **Cookie Settings panel renders**; reports "only necessary"; no tracking banner appears |
| https://usamif.com/refunds | Points to platforms; no invented refund windows |
| https://usamif.com/payments | States payment happens on platforms; EGP note |
| https://usamif.com/ai-use | Describes Ask USAM as local matcher |
| https://usamif.com/privacy-requests | **Request form submits**, shows a `PRQ-` receipt + "not approval" note |
| https://usamif.com/contact | **Enquiry submits**; shows privacy-notice line (no required Terms gate while draft); marketing checkbox optional + unchecked |
| https://usamif.com/for-enterprises | Enterprise form submits with the same acceptance behavior |
| https://usamif.com/government | Government form submits; marketing checkbox present |
| Footer (any page) | Links to Legal Center, Privacy, Terms, Cookies, Refunds, Payment Security + a **Cookie Settings** button that opens the modal |
| Language toggle → العربية | **RTL** layout mirrors correctly on legal pages, forms, cookie modal; no broken direction |
| Mobile width (~375px) | Pages, footer, cookie modal usable and not clipped |
| Theme toggle → dark | Legal pages, badges, cookie UI legible with correct contrast |
| Ask USAM | Floating button not covered by any legal UI; opens; (no cookie banner today, so no overlap) |
| Keyboard only | Tab through a form + cookie modal; visible focus; Escape closes modal |

---

## 6. Remaining actions in the platform repos

Full detail in `docs/USAM-legal-cross-platform-contract.md`. Per platform:

- **Education (edu.usamif.com)** — signup Terms/Privacy acceptance + optional
  marketing (distinct, server-enforced, recorded with version); own cookie
  consent; checkout currency/fees + refund link + provider disclosure; binding
  refund policy for courses/subscriptions; Privacy Center + DSR; store amounts in
  actual currency.
- **Career (jobs.usamif.com)** — all of the above, PLUS recruitment specifics:
  candidate CV/profile visibility, employer access rules, Talent-Pool opt-in, AI
  matching/assessment disclosure, object-level authorization so one employer
  can't read another's private candidate data.
- **Freelancing (freelancing-platform.usamif.com)** — all of the base set, PLUS
  marketplace specifics: provider profiles, service listings, payouts/disputes,
  and marketplace-transaction refund rules; do not relabel contract currencies.
- **Kids (kids.usamif.com)** — do **not** copy the adult signup. Implement the
  jurisdiction-reviewed **age threshold + parent/guardian consent**, a
  parent-facing notice, data minimization, and safety/visibility controls.
- **All platforms** — consume `GET https://usamif.com/api/v1/legal/{type}` for
  shared policy versions; treat `approval:draft` as non-binding; publish no
  PCI/"100% secure"/bank-partnership claims without evidence.

> None of §6 is delivered by the Master repo. The Master cannot complete the
> ecosystem on its own.
