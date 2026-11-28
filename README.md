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

Requires Node.js `>=22.13` and npm 10.

### Run locally
```bash
npm ci            # install from the locked dependency set
npm run dev       # dev server (Vinext + HMR) on http://localhost:5173
```
Pages work right away. The lead, privacy-request and feedback forms need the
local D1 tables. Without them they answer `503 dependency_unavailable`.
1. Start `npm run dev` once, so the local D1 file is created under
   `.wrangler/state/v3/d1/`, then stop it.
2. Apply each migration in order, **from the repo root**. The script uses a
   relative `.wrangler/state` path.
   ```bash
   node scripts/apply-migration-local.mjs drizzle/0000_glorious_franklin_storm.sql
   node scripts/apply-migration-local.mjs drizzle/0001_plain_khan.sql
   node scripts/apply-migration-local.mjs drizzle/0002_glossy_kid_colt.sql
   node scripts/apply-migration-local.mjs drizzle/0003_tan_magneto.sql
   node scripts/apply-migration-local.mjs drizzle/0004_serious_chamber.sql
   ```
3. Start `npm run dev` again.

Optional settings (admin token and notify channels): copy
[`.env.example`](.env.example) to `./.dev.vars` and fill in values. Never commit it.

### Test and check (same as CI)
```bash
npm run lint      # must have 0 errors (warnings allowed)
npx tsc --noEmit  # type-check, must be clean
npm test          # vitest suite (fake DB, no D1 needed)
npm run build     # production build (Cloudflare artifact in dist/)
npm audit --omit=dev --audit-level=high   # dependency scan used in CI
```
Other: `npm start` previews the built Worker locally. `npm run db:generate`
makes a Drizzle migration after schema changes.

### Deploy (server)
Production runs `npm start` (`wrangler dev --local`, Miniflare) as the systemd
service `usam`, behind nginx. Full steps, backup and rollback are in
[`docs/USAM-legal-deploy-runbook.md`](docs/USAM-legal-deploy-runbook.md). In short:
1. Back up the D1 sqlite and note the current commit.
2. `git pull --ff-only origin main`, then `rm -rf dist .vinext`, `npm ci`, `npm run build`.
3. Stop the service, apply only the new migrations with
   `scripts/apply-migration-local.mjs`, then start the service.
4. Secrets live in `~/.usam/dev.vars` (names in `.env.example`). `npm start`
   stages them into `dist/server/.dev.vars`. Miniflare does not read the
   systemd environment, so a systemd `Environment=` line is not enough.
5. nginx must send `proxy_set_header X-Real-IP $remote_addr;` (used by the
   rate limits, PR #7).

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

Names are listed in [`.env.example`](.env.example) (no values). Values go in a
`KEY=VALUE` file (`~/.usam/dev.vars` on the server, `./.dev.vars` locally),
which `npm start` stages for Miniflare. **No secrets are committed.** Missing
integrations produce a `not_configured` / disabled state and never fake success.

| Variable | Effect |
|----------|--------|
| `USAM_ADMIN_TOKEN` | Required for every `/api/v1/admin/*` endpoint; unset = admin disabled (403). Random, 32+ characters, rotated when staff change. |
| `USAM_MFA_ENCRYPTION_KEY` | Staff MFA (TOTP secrets encrypted with AES-GCM, backup-code hashes). Random, 32+ characters. Unset = MFA set-up and MFA sign-in refused (503). Changing it voids all enrolments. |
| `USAM_AUDIT_HMAC_KEY` | Admin audit log hash chain and signed daily export. Random, 32+ characters. Unset = no audit entries and sensitive admin actions refused (503). Do not change once rows exist. |
| `USAM_LEAD_NOTIFY_WEBHOOK` | Optional. Enables webhook delivery of lead-notification outbox events. |
| `USAM_LEAD_NOTIFY_EMAIL` | Optional. Marks an email channel (provider wiring is a gated task). |
| `USAM_SITE_URL` | Optional. Public origin for sitemap/robots; default `https://usamif.com`. |
| `USAM_TRUST_CF_CONNECTING_IP` | Optional, lands with the rate limits (PR #7). `1` = trust `CF-Connecting-IP` as client IP; only if the origin accepts Cloudflare traffic alone. |
| `USAM_DEV_VARS_FILE` | Optional, launcher only. Path of the secrets file to stage instead of the defaults. |

The database is the D1 binding `DB` (`.openai/hosting.json`), not a variable.

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
