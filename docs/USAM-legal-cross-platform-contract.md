# USAM Legal / Consent — Cross-Platform Integration Contract

**Scope of this document.** This repository is the **USAM Master website**
(`usamif.com`), a discovery and enquiry portal. The work in this repo is
complete for the Master. The ecosystem is **not** complete from Master-only
changes: the selling platforms (Education, Career, Freelancing, Kids) each own
accounts, payments, course/recruitment/marketplace data, and therefore must
deploy their own legal/consent surfaces. This contract states exactly what each
platform must implement and the shared interface between them.

Do not treat anything here as "already deployed" on a platform. Each platform
team owns verification in its own repo.

---

## 1. Division of responsibility (who owns what)

| Concern | Master (`usamif.com`) | Platforms (edu / jobs / freelancing / kids) |
|---|---|---|
| Central Legal Center | **Owns** (hosts the index + policy pages) | Link back to it; add platform supplements |
| Privacy Policy | Master-site processing only (enquiries, preferences) | Account, learning/recruitment/marketplace, payments processing |
| Terms | Discovery/enquiry role | Service terms: accounts, subscriptions, purchases, content |
| Cookie consent | Own banner/settings for this site | **Own** banner/settings for the platform's own trackers |
| Registration acceptance | No account system here (links out) | **Own** signup Terms/Privacy/marketing acceptance + evidence |
| Payment / refund rules | Informational only; routes to platform | **Own** binding refund/cancellation + checkout disclosures |
| Privacy requests | Captures requests about Master data | **Own** Privacy Center for platform-held data |
| Consent evidence store | Master events (`consent_events`) | **Own** store; share version via the contract below |

**Rule:** a consent or acceptance obtained on one property does **not**
authorize processing on another. Preferences do **not** silently synchronize
across subdomains. Any cross-property sharing must be an explicit, documented
integration — not an assumption.

---

## 2. Shared policy-version contract

So the ecosystem can tell that two properties reference the same policy release,
platforms must consume the Master's published policy metadata rather than
hard-coding their own version strings for shared documents.

**Interface (read-only, public):**

```
GET https://usamif.com/api/v1/legal/{type}?locale={en|ar}
type ∈ privacy | terms | cookies | refunds | payments | ai-use | privacy-requests
```

Response (envelope `{ data, meta }`), `data` shape:

```jsonc
{
  "type": "privacy",
  "locale": "en",
  "title": "Privacy Policy",
  "scope": "…",
  "appliesTo": "…",
  "sections": [{ "id": "who-we-are", "title": "…", "body": "…" }],
  "approval": "draft" | "published",   // honest state; "draft" = provisional
  "version": "2026-02-draft-1",        // the SHARED release identifier
  "effectiveAt": "YYYY-MM-DD" | null,
  "updatedAt": "YYYY-MM-DD"
}
```

**Platform obligations:**
1. When recording acceptance of a **shared** policy (e.g. the ecosystem Privacy
   Policy), store the `version` returned by this endpoint alongside the
   acceptance, so Master and platform evidence line up.
2. Treat `approval: "draft"` as **not binding** — do not present a draft as a
   final notice to end users. Only surface `published` releases as binding.
3. For **platform-specific** policies (course terms, employer terms, checkout
   terms), the platform owns its own version string; it need not come from here.

> This endpoint is additive and already live in this repo. No platform change
> is required for the Master to serve it; platform changes are required to
> *consume* it.

---

## 3. What each platform must deploy

### 3.1 All selling platforms (Education, Career, Freelancing)

- **Registration acceptance** at the point an account is actually created:
  - Unchecked, **required** Terms checkbox: "I agree to the Terms of Service." /
    «أوافق على شروط الخدمة.»
  - A visible **Privacy Notice** link (acknowledging the notice is *not* blanket
    consent for every purpose).
  - A separate, unchecked, **optional** marketing checkbox: "I would like to
    receive offers and product updates." / «أرغب في تلقي العروض ومستجدات المنتجات.»
  - Refusing marketing (or optional cookies) must **not** block registration.
  - Enforce required acceptance **server-side**, including social-signup flows.
  - Record **distinct** events (terms / privacy acknowledgement / marketing /
    cookie) with policy version, purpose, platform, timestamp, locale, and the
    account or anonymous id — minimizing personal data.
- **Cookie consent** for the platform's own trackers: necessary vs optional
  categories; Accept all / Reject optional / Customize with equal prominence;
  reopen from footer; withdrawal that actually stops optional scripts. If a
  platform has only necessary storage, it must **not** show a misleading
  optional-tracking banner.
- **Checkout disclosure** before payment: final charge **currency, amount,
  taxes, fees**; recurring/subscription nature where applicable; a link to the
  binding refund/cancellation policy; the payment-provider disclosure.
- **Refund/cancellation policy** that is the binding source of truth, organized
  by the real offering (subscription / course / service / booking / marketplace),
  covering eligibility, cancellation vs refund, request steps, required order
  reference, review process, refund destination, and **verified** processing
  timeframes. No invented universal "no refunds" rule or made-up window.
- **Payment security** implemented per the real integration: provider-hosted
  checkout or tokenized/hosted fields; **no** raw card data (and never CVV after
  authorization) in logs, analytics, AI tools, or support forms; server-side
  verification of payment status, webhook authenticity, authorization and
  idempotency; secrets in a managed store, never in code/DB/logs. No "PCI
  certified"/"100% secure"/bank-partnership/card-logo/3-D-Secure claims without
  evidence and permission.
- **Privacy Center + data-subject requests** for platform-held data: access,
  correction, deletion, export/portability and consent withdrawal **where the
  applicable law provides them**, with identity verification before any
  disclosure/deletion, a request queue, and audit logging.
- **Currency:** store transaction amounts in the **actual** currency charged;
  never relabel historical foreign-currency transactions as EGP or silently
  convert marketplace contracts. EGP is the base for USAM-owned pricing.

### 3.2 Career (recruitment-specific, per reference 03)

In addition to 3.1: candidate CV/profile visibility controls, employer access
rules, Talent-Pool participation, application-sharing, and AI matching/assessment
disclosures — all **server-enforced**, with object-level authorization so one
employer cannot read another's private candidate data.

### 3.3 Kids (per instruction §7, reference 02 §19)

Kids must **not** copy the adult signup flow. It must implement the
jurisdiction-reviewed **age threshold and parent/guardian** mechanics, a
parent-facing notice, data minimization, and safety/visibility controls. Age
thresholds and guardian-consent mechanics are **[REQUIRES LEGAL REVIEW]** and
configured on the Kids platform, not here.

---

## 4. Master → platform links already in place

The Master footer and legal pages link out to each platform for
account/payment/platform-specific policies. The configured destinations are:

| Platform | Destination | Audience note |
|---|---|---|
| Education | `https://edu.usamif.com` | Individuals, Enterprises, Government |
| Career | `https://jobs.usamif.com` | Individuals, Talent, Enterprises |
| Freelancing | `https://freelancing-platform.usamif.com` | Talent, Enterprises, Individuals |
| Kids | `https://kids.usamif.com` | Kids & Parents |

> If a platform's final production hostname differs from the above, update
> `data/products.ts` (and `trustedDomain()` relies on these hostnames).

---

## 5. Checklist for a platform to be "legally integrated"

- [ ] Consumes `GET /api/v1/legal/{type}` for shared policy versions.
- [ ] Signup records distinct Terms / Privacy / marketing events (server-enforced).
- [ ] Optional marketing + optional cookies are refusable without blocking signup.
- [ ] Cookie consent actually gates the platform's optional trackers.
- [ ] Checkout shows final currency/amount/taxes/fees + refund link + provider.
- [ ] Binding refund/cancellation policy published, organized by offering.
- [ ] Payment integration: hosted/tokenized, no raw card data retained, webhooks verified.
- [ ] Privacy Center + DSR workflow with identity verification + audit log.
- [ ] Transaction amounts stored in actual currency; no silent EGP relabeling.
- [ ] Kids: guardian/age mechanics, not the adult flow.
- [ ] No unverified compliance/PCI/bank-partnership claims published.

**None of the above is delivered by the Master repository.** This document is
the hand-off; each platform team implements and verifies it in its own repo.
