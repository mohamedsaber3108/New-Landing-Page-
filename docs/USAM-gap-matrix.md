# USAM Master — Evidence-Backed Gap Matrix (Phase 0)

> Required first deliverable per the handoff (section 22, "Produce an evidence-backed
> gap matrix before changing architecture"). This records the **observed** state of the
> delivered Master source and classifies each area so later phases do not rebuild working
> parts or invent missing ones.

**Baseline inspected:** `m:\USAM-Master-Ecosystem` working tree, this session.
**Legend:** `EXISTS` observed working in source · `PARTIAL` present but incomplete ·
`ABSENT` not present · `GATED` needs an external decision/credential before it can be real.

---

## 1. Routes / pages (handoff section 5, IDs P01–P19)

Evidence: `app/page.tsx`, `app/[...slug]/page.tsx`, `data/products.ts` (`routes`),
`components/usam-site.tsx`, `components/page-content.tsx`.

| ID | Route | Observed state | Class | Note |
|----|-------|----------------|-------|------|
| P01 | `/` | Hero, journey, product chapters, FAQ, guide drawer render from static data | PARTIAL | Content hard-coded in components, not CMS; CTAs work |
| P02 | `/about` | Static editorial sections (EN/AR) | PARTIAL | No CMS, no approved company facts |
| P03 | `/ecosystem` | Static sections + `ConnectedJourney` | PARTIAL | Journey is client-only illustration |
| P04 | `/explore` | Client-side product/skill text filter | PARTIAL | Local filter only; no `/search` API |
| P05 | `/how-it-works` | Static 3-step sections | PARTIAL | — |
| P06 | `/for-individuals` | Static sections + product grid | PARTIAL | — |
| P07 | `/for-enterprises` | Static sections; **no enquiry form** | PARTIAL | Handoff requires a lead form here |
| P08 | `/government` | Static sections; **no initiative brief form** | PARTIAL | — |
| P09 | `/for-talent` | Static sections | PARTIAL | — |
| P10 | `/kids` | Static sections, product grid | PARTIAL | No child accounts (correctly) |
| P11 | `/pricing` | Static directory copy; links to products | PARTIAL | No pricing feed (GATED on commerce) |
| P12 | `/contact` | **Static guidance text + "Open Guide" button only; no working form** | ABSENT (form) | Primary Phase-1 target |
| P13 | `/trust` | Static sections | PARTIAL | — |
| P14 | `/faq` | Static accordion (EN/AR) | PARTIAL | No CMS/feedback API |
| P15 | `/guide` | Static sections + drawer launch | PARTIAL | Local matcher only (correct) |
| P16 | `/privacy` | **Provisional navigational copy**, not an approved notice | PARTIAL | Must stay labelled provisional |
| P17 | `/terms` | Provisional navigational copy | PARTIAL | Must stay labelled provisional |
| P18 | `/cookies` | Static copy; no real consent controls | PARTIAL | No analytics yet, so no controls needed |
| P19 | `/status` | Static "not monitored" copy | PARTIAL | Keep "not monitored" until monitoring exists |
| —  | `/for-business` → `/for-enterprises` | Redirect present | EXISTS | `app/[...slug]/page.tsx` |
| —  | Unknown slug → 404 | `notFound()` | EXISTS | — |

## 2. Cross-cutting frontend concerns

| Area | Evidence | Class |
|------|----------|-------|
| EN/AR bilingual copy | throughout components | EXISTS |
| RTL document direction | `usam-site.tsx` sets `document.documentElement.dir` | EXISTS |
| Light/green dark mode | `theme-*` class + `colorScheme`, persisted to localStorage | EXISTS |
| Ask USAM full-height side drawer | `GuideConnector` / `research-landing.tsx` | EXISTS — **protected, do not alter** |
| Logo / brand assets | `public/brand/*`, `Mark()` component | EXISTS — **protected** |
| Server-readable locale / locale URLs | none; client toggle only | ABSENT |

## 3. Backend / API (handoff sections 12–13)

Evidence: `db/schema.ts`, `db/index.ts`, `app/api/*`, `.openai/hosting.json`, `vite.config.ts`.

| Handoff ID | Target | Observed state | Class |
|-----------|--------|----------------|-------|
| — | D1 binding `DB` | Enabled in `hosting.json`; wired in `vite.config.ts`; `cloudflare-env.d.ts` declares it | EXISTS |
| — | Drizzle schema | `enquiries` + `guide_signals` tables (prior session) | PARTIAL |
| L01 / 14.1 | `POST /leads` durable capture | `POST /api/enquiries` exists: validation + insert + owner-scoped GET | PARTIAL — needs v1 path, idempotency, outbox, reference, envelope |
| — | Idempotency keys | none | ABSENT |
| — | Transactional outbox | none | ABSENT |
| — | `{ data, meta }` / `{ error }` envelopes | routes return ad-hoc JSON | ABSENT |
| C01 | `GET /content/pages/:slug` | content hard-coded in components | ABSENT (API) |
| C02 | `GET /products` | `data/products.ts` exists but no API | ABSENT (API) |
| C06 | `GET /faqs` | FAQ array in `page-content.tsx`, no API | ABSENT (API) |
| C08 | `GET /legal/:type` | provisional copy, no API | ABSENT (API) |
| C09 | `GET /pricing` | no verified feed | GATED (commerce) |
| C10 | `GET /status` | static page, no checks | ABSENT (API) → honest `not_monitored` |
| A02 | `POST /guide/resolve` | `lib/guide-intent.ts` local matcher | PARTIAL (local fallback is correct) |
| F01–F03 | uploads | none | ABSENT (not in this milestone) |

## 4. Explicitly GATED (needs a business decision or external access — not built, surfaced honestly)

| Capability | Blocker | Honest state until unblocked |
|-----------|---------|------------------------------|
| Identity / SSO (I01–I20) | Approved OIDC provider + account-linking rules | Existing hosting ChatGPT headers only; no cross-product SSO claim |
| Product adapters (E/K/R/Y APIs) | Real endpoints, auth, sandbox credentials for edu/jobs/freelancing/kids | External links only; `not_configured` adapters |
| AI gateway / live agents (A03–A10) | Model provider, budgets, approved agents, safety policy | Local "Platform guide" fallback, labelled |
| Pricing / payments / payouts (14.6, R15–R17) | Approved PSP + commercial model | Verified product links only; checkout disabled |
| Child accounts (Y01–Y10) | Age policy + guardian verification + moderation | Public demonstration only; no child data |
| Approved legal text (P16/P17, S08) | Policy owner sign-off | Keep provisional label |
| Live status monitoring (P19, C10) | Monitoring probes | `not_monitored` state |

## 5. This milestone (Phase 0 + unblocked Phase 1) — what will be implemented in-repo

1. This gap matrix (Phase 0 deliverable). **DONE on write.**
2. `/api/v1` conventions: `{ data, meta }` + `{ error }` envelopes, `requestId`.
3. `POST/GET /api/v1/leads` — durable persistence, idempotency keys, transactional
   outbox, lead reference, concurrent-duplicate correctness.
4. `/api/enquiries` kept as a backward-compatible server-side alias (no HTTP redirect for POST).
5. Public read endpoints backed by existing in-repo data: `GET /api/v1/products`,
   `/content/pages/:slug`, `/faqs`, `/legal/:type` (provisional), `/status` (not_monitored).
6. Contact page wired to `POST /api/v1/leads` with loading/error/success states.
7. Integration tests + API docs.

Nothing in section 4 (GATED) is implemented as a working feature; those surfaces report
truthful unavailable / `not_configured` states.

---

## 6. Progress checklist — this implementation milestone

Completed (in-repo, no gated dependencies):

- [x] Phase 0 gap matrix (this document).
- [x] Data model: `enquiries` extended (reference, organization, marketing_opt_in,
      received status); added `idempotency_keys` and `outbox_events`.
      Migration `drizzle/0001_plain_khan.sql`; applied to local D1.
- [x] API primitives: `{ data, meta }` / `{ error }` envelopes, requestId,
      reference generator, error classification (`lib/api/envelope.ts`).
- [x] Idempotency: hashing + composite-PK reservation with race safety
      (`lib/api/idempotency.ts`).
- [x] Shared lead core: validation, transactional lead+outbox write,
      owner-scoped listing, honest `notificationStatus` (`lib/api/leads.ts`).
- [x] Canonical `POST/GET /api/v1/leads` (idempotency-aware).
- [x] Backward-compatible `/api/enquiries` alias (no HTTP redirect; same core).
- [x] Public reads: `/api/v1/products`, `/content/pages/:slug`, `/faqs`,
      `/legal/:type` (provisional), `/status` (not_monitored).
- [x] Frontend Contact page wired to `POST /api/v1/leads` with loading/error/
      success states; preserves design, RTL, dark mode; shows reference; never
      shows success on failure.
- [x] Integration tests (vitest): 28 passing.
- [x] API documentation (`docs/USAM-backend-api.md`).

Remaining in-repo, unblocked (next dependency-ordered steps for a later milestone):

- [ ] Outbox delivery **worker** scaffold with a feature flag (interface ready;
      activation needs a configured channel — see Blocked).
- [ ] `GET /api/v1/search` (C05) over the public capability/product catalogue.
- [ ] `POST /api/v1/feedback` (C07) for FAQ helpfulness (rate-limited, no PII).
- [ ] `POST /api/v1/guide/resolve` (A02) wrapping the existing local matcher in
      the v1 envelope, labelled local fallback.
- [ ] Wire `/explore`, `/faq`, `/status`, legal pages to their read endpoints
      (progressive enhancement; content already renders from source today).
- [ ] CMS-backed page versioning (replaces `source: "static"`).

Blocked (need a business decision / external access / credentials) — see
`docs/USAM-backend-api.md` “Blocked” table for exact unblock requirements:
notification delivery, pricing feed, identity/SSO, product adapters, AI gateway,
payments/payouts, child accounts, approved legal text, live status monitoring.
