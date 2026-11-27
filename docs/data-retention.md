# Data retention per table (L-S2)

Status: **inventory plus proposal.** Every "Proposed retention" below is a **proposal; the owner and counsel decide** (legal decisions are the owner's, `PROJECT_STATUS.md` s.4). Nothing here is legal advice or a statement of what the law requires.

Source: `db/schema.ts` at the commit of this file. "Today" means what the code does now, checked by searching `app/` and `lib/` for delete or purge code.

**Finding: no record is deleted automatically today.** No table has a cleanup job. The only delete-like code removes in-memory rate-limit counters (`lib/api/rate-limit.ts`), not database rows. `idempotency_keys.expires_at` is set (24 h), but nothing removes expired rows.

**Gap to flag to the owner:** the draft privacy policy (`lib/legal/policies.ts`, section `retention-and-rights`) says each record is kept "only as long as needed … and then delete it". The code does not do this yet. Either a cleanup job is built, or the text is adjusted before publishing.

| Table | Personal data it holds | Today | Proposed retention (proposal, owner and counsel decide) |
|---|---|---|---|
| `enquiries` | name, email, message, organization, role, phone, country, beneficiaries (free text), user_id (signed-in visitors), marketing opt-in, IP: **not stored** | Kept forever, no delete | Closed enquiries: delete or anonymise 24 months after the last status change. Keep `reference`, `kind`, `product`, `created_at` for counts. Open enquiries: keep while open. |
| `privacy_requests` | name, email, message, related_reference, user_id, staff_note (may hold personal text), assigned_to (staff name) | Kept forever, no delete | Keep 24 months after completion or rejection as evidence the request was handled, then delete the free text (name, email, message, staff_note). Keep `reference`, type, status and dates. |
| `consent_events` | actor (signed-in user id or "anonymous"), subject_ref (enquiry reference), policy version, method, locale, detail (cookie choices, no free text) | Kept forever, no delete | Keep while the linked enquiry exists, plus 24 months (evidence of consent). Cookie-choice rows with actor "anonymous": 13 months. |
| `outbox_events` | payload = reference + type + product/locale only (no message, email or phone; `lib/api/leads.ts`, `lib/api/privacy-requests.ts`); last_error (fixed safe text, PR #10) | Kept forever, no delete | Delivered events: delete after 30 days. Dead-letter events: keep 90 days for follow-up, then delete. |
| `idempotency_keys` | actor (user id or "anonymous"), request_hash (SHA-256 of the body, not the body), response_body (reference + status) | Kept forever; `expires_at` set to +24 h but never purged | Delete when `expires_at` passes (the field already says 24 h). Technical only. |
| `guide_signals` | none: resolved intent, locale, accepted flag (the visitor's text is never stored) | Kept forever, no delete | 24 months, or aggregate monthly and delete raw rows. |
| `content_feedback` | none: content id, rating (+1/-1), locale | Kept forever, no delete | 24 months, or aggregate and delete raw rows. |
| `policy_publications` | published_by (staff name or label) | Kept forever, no delete | Keep for the life of the site. It is the version history of the legal texts. |
| `staff_users` (**arrives with PR #15**) | staff email, display name, role, passphrase hash, failed sign-in count | Not on main yet | While the person is staff. On leaving: disable at once, delete or anonymise after 12 months (audit trail need, L-A2). |
| `staff_sessions` (**arrives with PR #15**) | user id, keyed IP hash (only if `USAM_SESSION_HASH_SALT` is set), short user-agent | Not on main yet; expired rows kept | Delete 30 days after `expires_at`. |

Outside the database (not checked in this repo): nginx access and error logs. The draft privacy policy says they rotate daily and are kept about 14 days. That is server configuration and is **not verified here**.

Logs from the app itself: the only `console` call in `app/` and `lib/` is one rate-limit warning with no request data. `test/log-redaction.test.ts` checks that no submitted email, phone, name or message text reaches a log line in any public POST workflow or in outbox delivery.

## What would implement a decision
After the owner decides, one scheduled job (the same trigger as the outbox timer) can run the deletes or anonymisation per table, with a dry-run count first. That is a separate task, not part of L-S2.
