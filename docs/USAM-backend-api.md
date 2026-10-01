# USAM Master — Backend API (v1)

Status: Phase 1 foundation implemented in this repository. Endpoints that depend
on external decisions/credentials are **not** implemented and are listed under
[Blocked](#blocked-pending-external-input) with the exact information needed to
unblock each one.

Runtime: Vinext on Cloudflare Workers, Drizzle ORM over Cloudflare D1 (binding
`DB`). All routes live under `app/api/`.

## Response envelope

Every `/api/v1/*` route uses one shape (handoff section 13):

Success:
```json
{ "data": { "...": "..." }, "meta": { "requestId": "req_...", "nextCursor": "optional" } }
```

Error:
```json
{ "error": { "code": "validation_failed", "message": "…", "fieldErrors": { "email": ["…"] }, "retryable": false, "requestId": "req_..." } }
```

Error `code` → HTTP status: `bad_request` 400, `unauthenticated` 401,
`forbidden` 403, `not_found` 404, `conflict` 409, `validation_failed` 422,
`rate_limited` 429, `dependency_unavailable` 503, `internal_error` 500.
Internal errors never leak stack traces, SQL, tokens, or prompts.

## Endpoints implemented

### POST /api/v1/leads  (canonical) — handoff L01 / §14.1

Durably captures a contact / partnership enquiry.

Headers:
- `Content-Type: application/json`
- `Idempotency-Key: <uuid>` (optional but recommended)

Body:
```json
{
  "name": "Example Person",
  "email": "person@example.org",
  "kind": "general | product-help | partnership | government | enterprise",
  "product": "education | career | freelancing | kids | ecosystem (optional)",
  "organization": "optional",
  "locale": "en | ar",
  "message": "min 10, max 4000 chars",
  "marketingOptIn": false
}
```

Validation: name 2–120, email ≤254 (lowercased), message 10–4000. Unknown
`kind`/`locale` fall back to safe defaults. `marketingOptIn` defaults to `false`
and is never bundled with other consent.

Success `201`:
```json
{ "data": { "reference": "USAM-7F3K2Q", "status": "received", "notificationStatus": "pending | not_configured" }, "meta": { "requestId": "req_..." } }
```

Behavior:
- The enquiry row **and** a `lead.created` transactional-outbox event are written
  in a single DB transaction. If either fails, neither is persisted.
- `notificationStatus` is `not_configured` until a delivery channel exists (see
  Blocked). The lead is stored regardless; the outbox event stays `pending`.
- **Idempotency:** a repeat with the same key + same body replays the first
  `201` (same reference). Same key + different body → `409 conflict`
  (`body_mismatch`). Concurrent duplicates → exactly one lead is written; losers
  get the stored response or a safe `409` (`in_flight`).

Errors: `422 validation_failed` (with `fieldErrors`), `409 conflict`,
`503 dependency_unavailable` (DB binding or table missing), `400 bad_request`
(non-JSON body).

### GET /api/v1/leads — owner-scoped

Returns the signed-in ChatGPT user's own leads only. Anonymous → `401`.
Response: `{ data: { leads: [{ reference, kind, product, status, locale, createdAt }] } }`.
Message bodies are not returned in the list.

### POST /api/enquiries  (backward-compatible alias)

Pre-v1 path. Handled in-process by the same `createLead` core — **no HTTP
redirect**, so POST bodies are preserved. Accepts the legacy field shape
(including `category` as an alias for `kind`). Honors `Idempotency-Key`.
Responses keep the original shapes: `{ enquiry, reference, notificationStatus }`
on success (now including the public `reference`); `{ errors: string[] }` on
validation failure; `{ error: string }` otherwise. New clients should use
`/api/v1/leads`.

### GET /api/v1/products — handoff C02

Public product registry (no secrets). Each product reports
`integrationLevel: "link_only"` and `availability: "external"` until a verified
adapter exists.

### GET /api/v1/content/pages/:slug?locale=en|ar — handoff C01

Published informational page sections for a known route slug. `404` for unknown
slugs. `source: "static"` (content lives in source; CMS versioning is a later
phase).

### GET /api/v1/faqs?locale=en|ar — handoff C06

Published FAQ question/answer pairs with stable ids.

### GET /api/v1/legal/:type?locale=en|ar — handoff C08

`:type` ∈ `privacy | terms | cookies`. **Returns `approval: "provisional"` with
`version: null`.** Exposing this copy via API does not make it an approved
policy; it must stay labelled provisional until a policy owner signs off.

### GET /api/v1/status — handoff C10 / P19

Reports `overall: "not_monitored"`, `monitoringEnabled: false`, and every
component as `not_monitored` with `checkedAt: null`. It never renders a green
"operational" state because no monitoring exists yet.

## Reliability primitives

- `idempotency_keys` (composite PK `scope, actor, key`): the unique constraint
  is the concurrency guard. The first inserter proceeds; racing duplicates read
  the stored record and replay or conflict.
- `outbox_events` (`event_id` unique): transactional outbox. A delivery worker
  (not yet built — needs a configured channel) would later move `pending` →
  `delivered`. Deduplicate downstream by `event_id`.

## Data model (new in Phase 1)

`enquiries` gained `reference` (unique), `organization`, `marketing_opt_in`, and
a `received`-default `status`. Added `idempotency_keys` and `outbox_events`.
Migration: `drizzle/0001_plain_khan.sql` (the data-copy step backfills a
placeholder `reference` for any legacy rows so the SQLite table rebuild succeeds
on a populated DB; fresh databases copy zero rows).

## Configuration interface (no secrets committed)

- `USAM_LEAD_NOTIFY_WEBHOOK` or `USAM_LEAD_NOTIFY_EMAIL`: when either is set,
  `notificationStatus` becomes `pending` (a delivery worker can then process the
  outbox). Until then, enquiries are captured and queued, reported honestly as
  `not_configured`.

## Blocked (pending external input)

These are intentionally **not** implemented; they report honest unavailable
states today. Exact unblock requirements:

| Capability | Needed to unblock |
|-----------|-------------------|
| Lead notification delivery | A verified support inbox / CRM endpoint or sender domain + credentials, and the chosen channel (email vs webhook). Then build the outbox delivery worker. |
| Pricing feed (`/pricing`, C09) | Verified per-product plan data or exact pricing URLs from the commerce owner. No amounts may be invented. |
| Identity / sessions (I01–I20) | Approved OIDC provider (issuer, client id, callback/logout URLs) and account-linking rules. |
| Product adapters (E/K/R/Y) | Real API base URLs, auth method, sandbox credentials, and capability versions for edu/jobs/freelancing/kids. |
| AI gateway / live agents (A03–A10) | Model provider + region, approved agent registry entries, budgets, safety policy. |
| Payments / payouts (R15–R17, §14.6) | Approved PSP, merchant config, webhook verification, entitlement mapping. |
| Child accounts (Y01–Y10) | Age-band policy, guardian verification method, moderation ownership, retention. |
| Approved legal text | Policy owner sign-off; until then `/api/v1/legal/*` stays `provisional`. |
| Live status monitoring | Monitoring probes/provider; until then `/api/v1/status` stays `not_monitored`. |

## Testing

`npm test` (vitest). Covered: envelope mapping, lead validation + safe defaults,
idempotency hashing/reservation incl. concurrent races, lead+outbox
transactional write, idempotent create, concurrent-duplicate single-write, 409
on body mismatch, owner-scoped listing, and that failures never report success.
See `test/*.test.ts`. DB-dependent tests run against an in-memory fake that
honors unique-constraint races (no native modules required).
