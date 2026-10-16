# Platform legal/support link register — verification evidence

Purpose: the Payments page "Platform directory" must link only to destinations
we have actually verified. This records what was probed, the result, and the
decision. No sub-path is published unless it returned real, distinct content.

Probed: 2026-10-16 (HTTP GET, no redirects followed unless noted). "SPA shell"
means every probed path returned HTTP 200 with the **same byte length as the
home page**, i.e. a client-rendered single-page app that serves one shell for
any route — so a 200 there does **not** prove a real page exists.

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
→ No verifiable sub-path. Link **home only**.

Career (jobs) — SPA shell: all probed paths 200 but **all 2419 B = home**.
→ No verifiable sub-path. Link **home only**.

Kids (kids) — SPA shell: all probed paths 200 but **all 1059 B = home**.
→ No verifiable sub-path. Link **home only**.

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

## Reported as unavailable / unverifiable (accurate statement for users + owner)

- Education, Career, Kids expose no server-distinguishable policy/support URLs
  from the Master's vantage point (their sites are client-rendered). Their
  refund/privacy/support pages, if any, are reachable **inside** the app after
  opening it. We therefore do not publish deep links for them — only the home.
- Freelancing publishes **no** `/privacy`, `/terms`, or `/refunds` page today
  (all 404). If/when those exist, add them here after re-verifying.

## Business/legal input still needed (per platform)

Each selling platform must supply its verified, canonical refund, privacy,
terms and support URLs (and confirm ownership) before the Master links them as
policy destinations. Until then the directory links the home + any individually
verified support/contact page only.
