# USAM Master Ecosystem

The intelligent front door for the USAM ecosystem — a bilingual (English / Arabic,
full RTL) gateway that helps a visitor start with a **goal** and continue in the
right specialist product: **Education · Career · Freelancing · Kids**.

This repository is the **Master website + its own backend**. The four specialist
products are external services; this project links to them and owns only the data
the gateway itself needs (contact leads, anonymous guide signals, content
feedback).

- Stack: React 19, TypeScript, Vinext, Vite, Cloudflare Workers, D1 + Drizzle ORM.
- Live reference: https://usam-master-ecosystem.abdelrahman2611.chatgpt.site

---

## Quick start

Requires Node.js `>=22.13`.

```bash
npm ci            # install from the locked dependency set
npm run dev       # start the dev server (Vinext + HMR)
```

Then open the local address the dev server prints.

```bash
npx tsc --noEmit  # type-check
npm run build     # production build (Cloudflare artifact)
npm start         # preview the built Worker locally (D1/R2 aware)
npm test          # run the vitest suite
npm run db:generate   # generate a Drizzle migration after schema changes
```

---

## What's implemented

### Frontend
- Preserved hero, green identity, logo, and the full-height **Ask USAM** side
  drawer (English opens right, Arabic opens left).
- 1 landing route + 18 informational routes, all bilingual with light / green
  dark mode and keyboard access.
- A working **Contact** lead form and a live **Explore** search, both with
  loading / error / empty / success states.

### Backend (`/api/v1`, Cloudflare D1 + Drizzle)
All responses use one envelope: `{ data, meta }` on success,
`{ error: { code, message, fieldErrors?, retryable, requestId } }` on failure.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/leads` | Durable contact-lead capture: transactional lead + outbox write, idempotency-key support, concurrent-duplicate safety, public reference. |
| `GET /api/v1/leads` | The signed-in owner's own leads (private). |
| `POST /api/enquiries` | Backward-compatible alias of the lead endpoint (no HTTP redirect; same core logic). |
| `GET /api/v1/products` | Public product registry. |
| `GET /api/v1/content/pages/:slug` | Published informational page sections. |
| `GET /api/v1/faqs` | Published FAQ answers. |
| `GET /api/v1/legal/:type` | Privacy / terms / cookies — returned as `provisional`. |
| `GET /api/v1/status` | Service status — honest `not_monitored` state. |
| `GET /api/v1/search` | Public product / capability search with cursor pagination. |
| `POST /api/v1/feedback` | Content helpfulness signal (rating only, no free text). |
| `POST /api/v1/guide/resolve` | Local goal → product routing (labelled local, not live AI). |
| `POST /api/v1/admin/outbox/process` | Operations: drain the outbox (token-gated, fails closed). |

### Reliability primitives
- **Idempotency keys** (`idempotency_keys`): a composite primary key is the
  concurrency guard — one writer proceeds, duplicates replay or conflict.
- **Transactional outbox** (`outbox_events`): events are written in the same
  transaction as the business row; a delivery worker drains them later. With no
  channel configured, events stay `pending` and that is reported honestly.

See [`docs/USAM-backend-api.md`](docs/USAM-backend-api.md) for the full API
contract and [`docs/USAM-gap-matrix.md`](docs/USAM-gap-matrix.md) for the
evidence-backed state of every route and the remaining / blocked work.

---

## Configuration interface

Set via environment; **no secrets are committed**. Missing integrations produce a
`not_configured` / disabled state and never fake success.

| Variable | Effect |
|----------|--------|
| `USAM_LEAD_NOTIFY_WEBHOOK` | Enables webhook delivery of lead-notification outbox events. |
| `USAM_LEAD_NOTIFY_EMAIL` | Marks an email channel (provider wiring is a gated task). |
| `USAM_ADMIN_TOKEN` | Required for all `/api/v1/admin/*` endpoints; unset = admin disabled. |

**Admin token rule:** random (for example `openssl rand -hex 32`), at least 32
characters, rotated whenever staff with access change, and never pasted in chat,
tickets or the repo.

**Rate limits (per client IP, in process memory):** admin 60/min (all admin
routes together, checked before the token); `POST /api/v1/leads` and
`/api/enquiries` 10 per 10 min (shared); `POST /api/v1/privacy-requests` 5 per
10 min; `POST /api/v1/feedback` 30 per 10 min. Over the limit returns `429`
with `Retry-After` and a plain Arabic or English message with the wait time.
Client IP order: `X-Real-IP`, then the last `X-Forwarded-For` entry. nginx must
send `proxy_set_header X-Real-IP $remote_addr;`. `CF-Connecting-IP` is read
first only when `USAM_TRUST_CF_CONNECTING_IP=1`; set that only if the origin
accepts traffic from Cloudflare alone. With no IP header, public forms are not
limited (no shared bucket) and admin counts only failed token checks.

---

## Blocked (needs a business decision / external access)

Identity/SSO, product adapters, live AI gateway, pricing feed, payments, child
accounts, approved legal text, and live status monitoring are intentionally
**not** implemented and surface honest unavailable states. The exact information
required to unblock each is listed in
[`docs/USAM-backend-api.md`](docs/USAM-backend-api.md#blocked-pending-external-input).

---

## Project layout

```
app/            routes + /api endpoints
components/     UI (usam-site, research-landing, page-content, forms) + ui/ kit
data/           product + route catalogue
db/             Drizzle schema + D1 client
drizzle/        generated SQL migrations
lib/api/        envelope, idempotency, leads, content, outbox worker
docs/           API reference + gap matrix
test/           vitest integration suite
scripts/        Sites lifecycle + build/install helpers
```

---

## Platform notes (vinext starter)

This is a Vinext project with a Cloudflare-compatible production output, not a
plain Next.js build — preserve the supplied scripts and lockfile. For D1-backed
local previews, generate SQL with `npm run db:generate`, build once, then apply
each pending migration with Wrangler against `.wrangler/state`. Local tooling
state (`.wrangler/`, `.vinext/`, `.sites-runtime/`, `dist/`) is disposable and
git-ignored.
