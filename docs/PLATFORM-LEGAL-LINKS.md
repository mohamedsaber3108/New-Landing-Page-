# Platform legal/support link register — verification evidence

Purpose: the Payments page "Platform directory" must link only to destinations
we have actually verified. This records what was probed, the result, and the
decision. No sub-path is published unless it returned real, distinct content.

Probed: 2026-10-16 (HTTP GET, no redirects followed unless noted). "SPA shell"
means every probed path returned HTTP 200 with the **same byte length as the
home page**, i.e. a client-rendered single-page app that serves one shell for
any route — so a 200 there does **not** prove a specific page exists, and a
non-match does **not** prove it is absent. For those platforms the real routes
are built in the browser; our server-side probe simply cannot see them, so they
are recorded as **not yet discovered/verified**, pending a browser inspection.

## Homes (all verified live)

| Platform | Host | Home | Result |
|---|---|---|---|
| USAM Education | edu.usamif.com | `/` | 200 (shell, 3685 B) |
| USAM Career | jobs.usamif.com | `/` | 200 (shell, 2419 B) |
| USAM Freelancing | freelancing-platform.usamif.com | `/` | 200 (SSR, 111947 B) |
| USAM Kids | kids.usamif.com | `/` | 200 (shell, 1059 B) |

## Sub-path probe results

Education (edu) — SPA shell: `/privacy /terms /refunds /support /contact /help
/legal /privacy-policy /terms-of-service` all 200 but **all 3685 B = home**.
→ Policy/support URLs **not yet discovered or verified** from this (server)
vantage point. The app is client-rendered, so its real routes are produced in
the browser after load; those pages likely exist inside the app. This is NOT
"unavailable". Link **home only** until the rendered navigation is inspected in
a browser. (See the remaining-browser-checks list.)

Career (jobs) — SPA shell: all probed paths 200 but **all 2419 B = home**.
→ Same as above — **not yet discovered or verified**; link **home only** pending
a browser inspection of the rendered nav.

Kids (kids) — SPA shell: all probed paths 200 but **all 1059 B = home**.
→ Same as above — **not yet discovered or verified**; link **home only** pending
a browser inspection of the rendered nav.

Freelancing — server-rendered, distinct per route:
| Path | Result | Decision |
|---|---|---|
| `/support` | 200, 28548 B, title "Support — USAM" | **Verified → listed** |
| `/contact` | 200, 69175 B, real "Contact — talk to the team" page | **Verified → listed** |
| `/help` | 200, 68990 B (distinct) | Verified live, not listed (support+contact cover the need; avoid link clutter) |
| `/privacy` | 404 | Not listed |
| `/terms` | 404 | Not listed |
| `/refunds` | 404 | Not listed |
| `/legal` | 404 | Not listed |
| `/privacy-policy` | 404 | Not listed |
| `/terms-of-service` | 404 | Not listed |

## What ships

- All four platforms: a verified **home** link labelled "Open platform ↗".
- Freelancing only: additional verified deep links **Support** and **Contact**.
- Implemented in `components/legal-content.tsx` → `PLATFORM_VERIFIED_LINKS`.

## Status per platform (accurate statement for users + owner)

- **Education, Career, Kids — not yet discovered/verified (NOT "unavailable").**
  Their sites are client-rendered, so the server returns the same shell for
  every path and we cannot confirm specific policy/support URLs from here. Those
  pages very likely exist inside the running app. We link the home only and will
  add verified deep links once their rendered navigation is inspected in a
  browser (see below).
- **Freelancing — partially discovered.** `/support` and `/contact` verified and
  listed; `/privacy`, `/terms`, `/refunds` return 404 today, so they are not
  listed. Re-verify and add if/when those routes are published.

## Remaining browser checks (do when browser access is available)

1. Open each of edu/jobs/kids in a browser; inspect the rendered header/footer
   navigation for a privacy, terms, refund/cancellation, or support/help link.
2. For each link found, record its exact in-app URL and confirm it loads real
   policy/support content (not a redirect to the generic shell).
3. Add confirmed URLs to `PLATFORM_VERIFIED_LINKS` in
   `components/legal-content.tsx` and update this file with the date + result.
4. Re-check freelancing `/privacy`, `/terms`, `/refunds` in case they have since
   been published.

## Business/legal input still needed (per platform)

Each selling platform must supply its verified, canonical refund, privacy,
terms and support URLs (and confirm ownership) before the Master links them as
policy destinations. Until then the directory links the home + any individually
verified support/contact page only.
