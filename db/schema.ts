// USAM Master ecosystem backend schema.
//
// The Master site is a bilingual gateway that routes visitors to the four
// products (Education, Career, Freelancing, Kids). The only data it genuinely
// owns is:
//   1. Contact / partnership enquiries submitted from the Contact page.
//   2. Anonymous guide routing signals used to understand where visitors want
//      to go (never the raw message — only the resolved product intent).
//
// Everything product-specific (accounts, plans, payments) lives in the
// external platforms and is intentionally NOT modelled here.

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Enquiry categories offered on the Contact page. */
export const ENQUIRY_KINDS = [
  "general",
  "product-help",
  "partnership",
  "government",
  "enterprise",
] as const;

/** Products a visitor can be interested in, plus the ecosystem itself. */
export const ENQUIRY_PRODUCTS = [
  "education",
  "career",
  "freelancing",
  "kids",
  "ecosystem",
] as const;

/** Enterprise enquiry types (structured form on /for-enterprises). */
export const ENTERPRISE_ENQUIRY_TYPES = [
  "hiring",
  "workforce-development",
  "project-expertise",
  "partnership",
  "other",
] as const;

/** Government initiative types (structured form on /government). */
export const GOVERNMENT_INITIATIVE_TYPES = [
  "learning-program",
  "talent-development",
  "youth-program",
  "innovation-partnership",
  "other",
] as const;

/** Controlled ranges/timelines (shared, forward-compatible as text). */
export const PARTICIPANT_RANGES = [
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1000+",
] as const;

export const TIMELINE_OPTIONS = [
  "immediate",
  "1-3-months",
  "3-6-months",
  "6-12-months",
  "not-decided",
] as const;

export const BUDGET_RANGES = [
  "under-10k",
  "10k-50k",
  "50k-250k",
  "250k-plus",
  "prefer-to-discuss",
] as const;

/**
 * Lead lifecycle states (handoff section 14.1):
 * received → triaged → assigned → in_progress → resolved/closed.
 */
export const LEAD_STATUSES = [
  "received",
  "triaged",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
] as const;

/** Contact / partnership enquiries (leads) submitted from the Contact page. */
export const enquiries = sqliteTable(
  "enquiries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Public, human-shareable reference returned to the submitter (e.g. USAM-7F3K2Q).
    reference: text("reference").notNull(),
    // Stable ChatGPT user id when the visitor is signed in; null for anonymous.
    userId: text("user_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    // One of ENQUIRY_KINDS; stored as text for forward-compatibility.
    kind: text("kind").notNull().default("general"),
    // One of ENQUIRY_PRODUCTS; the destination the enquiry relates to.
    product: text("product"),
    // Optional organization name (enterprise / government enquiries).
    organization: text("organization"),
    // Preferred reply language: "en" or "ar".
    locale: text("locale").notNull().default("en"),
    message: text("message").notNull(),
    // Separate, off-by-default marketing opt-in (handoff: never bundled).
    marketingOptIn: integer("marketing_opt_in", { mode: "boolean" })
      .notNull()
      .default(false),
    // One of LEAD_STATUSES — triage state.
    status: text("status").notNull().default("received"),

    // --- Structured enterprise/government enquiry fields (all nullable so
    // existing rows and the Contact form remain valid). Added in migration
    // 0003; the Contact form leaves these null. ---
    role: text("role"),
    phone: text("phone"),
    country: text("country"),
    // Enterprise: one of ENTERPRISE_ENQUIRY_TYPES.
    // Government: one of GOVERNMENT_INITIATIVE_TYPES. Stored as text.
    enquiryType: text("enquiry_type"),
    participantRange: text("participant_range"),
    timeline: text("timeline"),
    budgetRange: text("budget_range"),
    beneficiaries: text("beneficiaries"),
    // Privacy acknowledgement provenance (handoff: record version + timestamp).
    privacyNoticeVersion: text("privacy_notice_version"),
    privacyAcknowledgedAt: text("privacy_acknowledged_at"),
    // Validated structured overflow for any additional captured fields; JSON
    // string. Never a dumping ground for the message body.
    details: text("details"),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("enquiries_reference_uq").on(table.reference),
    index("enquiries_created_at_idx").on(table.createdAt),
    index("enquiries_user_id_idx").on(table.userId),
    index("enquiries_status_idx").on(table.status),
  ],
);

export type Enquiry = typeof enquiries.$inferSelect;
export type NewEnquiry = typeof enquiries.$inferInsert;

/** The intents the local guide can resolve (mirrors lib/guide-intent.ts). */
export const GUIDE_INTENTS = [
  "education",
  "career",
  "freelancing",
  "kids",
  "clarify",
  "unknown",
] as const;

/**
 * Anonymous guide routing signals. Records only the resolved intent and the
 * chosen locale so the team can see where visitors want to go. The visitor's
 * raw message is never stored, preserving the documented product boundary.
 */
export const guideSignals = sqliteTable(
  "guide_signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Resolved intent (one of GUIDE_INTENTS). No free-text is persisted.
    intent: text("intent").notNull(),
    locale: text("locale").notNull().default("en"),
    // Whether the visitor followed the suggestion through to a product.
    accepted: integer("accepted", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("guide_signals_intent_idx").on(table.intent),
    index("guide_signals_created_at_idx").on(table.createdAt),
  ],
);

export type GuideSignal = typeof guideSignals.$inferSelect;
export type NewGuideSignal = typeof guideSignals.$inferInsert;

// ---------------------------------------------------------------------------
// Reliability primitives (handoff sections 13 & 14.1)
// ---------------------------------------------------------------------------

/**
 * Idempotency keys. A write that carries an `Idempotency-Key` header is recorded
 * here together with a hash of its normalized request body and the stored
 * response. A retry with the same key + same body replays the stored response;
 * the same key + a different body is a conflict (409). This is what makes
 * concurrent duplicate submissions safe.
 */
export const IDEMPOTENCY_STATUSES = ["processing", "completed"] as const;

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    // The caller-supplied key, scoped by endpoint + actor below.
    key: text("key").notNull(),
    // Logical endpoint scope, e.g. "POST /api/v1/leads".
    scope: text("scope").notNull(),
    // Actor key: user id when signed in, otherwise "anonymous".
    actor: text("actor").notNull().default("anonymous"),
    // SHA-256 (hex) of the normalized request body, to detect key reuse with a
    // different payload.
    requestHash: text("request_hash").notNull(),
    // "processing" while the first request runs; "completed" once a response is
    // stored. A second concurrent request that sees "processing" must not run
    // the side effect again.
    status: text("status").notNull().default("processing"),
    // Stored response fields, populated when status becomes "completed".
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    // When this record may be garbage-collected (recommended 24h).
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    // One record per (scope, actor, key): this is the concurrency guard. The
    // first inserter wins; a racing duplicate hits this unique constraint.
    primaryKey({ columns: [table.scope, table.actor, table.key] }),
    index("idempotency_expires_at_idx").on(table.expiresAt),
  ],
);

export type IdempotencyRecord = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyRecord = typeof idempotencyKeys.$inferInsert;

/**
 * Transactional outbox. A business write (e.g. inserting a lead) and the event
 * describing it are inserted in the SAME database transaction. A separate
 * worker later delivers each pending event (email / CRM / notification). If no
 * delivery channel is configured, events simply remain `pending` and that is
 * reported honestly — the lead is never lost because a notification failed.
 */
export const OUTBOX_STATUSES = [
  "pending",
  "delivering",
  "delivered",
  "failed",
  "dead_letter",
] as const;

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Stable unique event id (ULID/UUID) used for downstream deduplication.
    eventId: text("event_id").notNull(),
    // e.g. "lead.created" (handoff section 14.8 minimum event set).
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    // Opaque reference to the aggregate this event is about (e.g. lead reference).
    aggregateRef: text("aggregate_ref"),
    // JSON payload (references, not sensitive raw content where avoidable).
    payload: text("payload").notNull().default("{}"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    // Earliest time a delivery attempt should be made (backoff scheduling).
    nextAttemptAt: text("next_attempt_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deliveredAt: text("delivered_at"),
  },
  (table) => [
    uniqueIndex("outbox_event_id_uq").on(table.eventId),
    index("outbox_status_next_idx").on(table.status, table.nextAttemptAt),
    index("outbox_event_type_idx").on(table.eventType),
  ],
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;

// ---------------------------------------------------------------------------
// Content feedback (handoff C07) — FAQ / page helpfulness signals
// ---------------------------------------------------------------------------

/**
 * Anonymous helpfulness feedback for a published content item (FAQ answer or
 * page). Deliberately stores NO free text: only a bounded rating and the
 * content id, so a public endpoint cannot be used to harvest personal data.
 */
export const content_feedback = sqliteTable(
  "content_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // e.g. "faq-3" or a page slug; validated against known ids server-side.
    contentId: text("content_id").notNull(),
    // -1 (not helpful) or 1 (helpful). No scale that could encode a message.
    rating: integer("rating").notNull(),
    locale: text("locale").notNull().default("en"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("content_feedback_content_idx").on(table.contentId),
    index("content_feedback_created_at_idx").on(table.createdAt),
  ],
);

export type ContentFeedback = typeof content_feedback.$inferSelect;
export type NewContentFeedback = typeof content_feedback.$inferInsert;

// ---------------------------------------------------------------------------
// Legal / consent subsystem (Legal Implementation Pack)
// ---------------------------------------------------------------------------

/**
 * Distinct consent/acceptance event kinds (reference 02 §3/§5). Each is recorded
 * SEPARATELY — a single "I agree" is never used to cover everything.
 *   terms_acceptance        — accepted the Terms of Use (required where shown).
 *   privacy_acknowledgement — acknowledged the Privacy notice was presented.
 *   marketing_consent       — optional opt-in to marketing (true) or withdrawal.
 *   cookie_choice           — accept/reject/custom optional-cookie categories.
 */
export const CONSENT_EVENT_TYPES = [
  "terms_acceptance",
  "privacy_acknowledgement",
  // Notice PRESENTATION (not consent): records that the privacy notice was
  // shown at submission time. Distinct from an acknowledgement the user ticked,
  // and never treated as consent for any processing purpose.
  "privacy_notice_presented",
  "marketing_consent",
  "cookie_choice",
] as const;

/**
 * Auditable consent / acceptance evidence. Answers WHAT / WHICH version / WHY /
 * WHO / WHEN / HOW, while minimizing personal data: it stores an actor key
 * (signed-in user id or "anonymous"), NOT a copy of the person's profile. For
 * form-tied events, `subjectRef` links to the enquiry reference so staff can
 * see the evidence beside the submission without duplicating personal fields.
 */
export const consentEvents = sqliteTable(
  "consent_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // One of CONSENT_EVENT_TYPES.
    eventType: text("event_type").notNull(),
    // The processing purpose this event is about, e.g. "contact_enquiry",
    // "enterprise_enquiry", "marketing_updates", "site_cookies".
    purpose: text("purpose").notNull(),
    // granted = accepted/opted-in; denied/withdrawn = rejected or later removed.
    status: text("status").notNull().default("granted"),
    // Which policy release this evidence is bound to (e.g. "2026-02-draft-1").
    policyVersion: text("policy_version"),
    // Which policy type (privacy/terms/cookies/...), when applicable.
    policyType: text("policy_type"),
    // Platform/context where consent was obtained ("master" for this website).
    platform: text("platform").notNull().default("master"),
    // Signed-in ChatGPT user id, else "anonymous". Minimal identifier only.
    actor: text("actor").notNull().default("anonymous"),
    // Optional link to the enquiry this acceptance accompanied (its reference).
    subjectRef: text("subject_ref"),
    // UI/source that captured it, e.g. "contact-form", "cookie-banner".
    method: text("method"),
    // "en" or "ar" at the moment of capture.
    locale: text("locale").notNull().default("en"),
    // For cookie_choice: JSON of category decisions (reference-only, no PII).
    detail: text("detail"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("consent_events_type_idx").on(table.eventType),
    index("consent_events_actor_idx").on(table.actor),
    index("consent_events_subject_idx").on(table.subjectRef),
    index("consent_events_created_at_idx").on(table.createdAt),
  ],
);

export type ConsentEvent = typeof consentEvents.$inferSelect;
export type NewConsentEvent = typeof consentEvents.$inferInsert;

/** Privacy / data-subject request lifecycle (reference 02 §10). */
export const PRIVACY_REQUEST_TYPES = [
  "access",
  "correction",
  "deletion",
  "withdraw-consent",
  "question",
] as const;

/**
 * Lifecycle states. Deliberately gated on identity verification: a request can
 * never move to fulfilment while unverified, so no data is disclosed or deleted
 * on the strength of an email address alone.
 */
export const PRIVACY_REQUEST_STATUSES = [
  "received",
  "identity_verification",
  "in_review",
  "action_in_progress",
  "completed",
  "rejected",
] as const;

/**
 * Privacy / data-subject requests submitted from the Privacy Requests page.
 * Stores the minimum needed to contact the requester and act on the request;
 * identity proof itself is handled out of band (never stored as raw documents
 * here). Staff manage these through the protected admin endpoint.
 */
export const privacyRequests = sqliteTable(
  "privacy_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Public receipt reference returned to the requester (e.g. PRQ-7F3K2Q).
    reference: text("reference").notNull(),
    // One of PRIVACY_REQUEST_TYPES.
    requestType: text("request_type").notNull(),
    // One of PRIVACY_REQUEST_STATUSES; starts "received".
    status: text("status").notNull().default("received"),
    // Whether identity has been verified by staff (gates fulfilment).
    identityVerified: integer("identity_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    name: text("name").notNull(),
    email: text("email").notNull(),
    // Optional reference the requester gives us to locate their data
    // (e.g. a prior enquiry reference). Not a credential.
    relatedReference: text("related_reference"),
    locale: text("locale").notNull().default("en"),
    // Bounded free text describing the request.
    message: text("message"),
    // Signed-in user id when available, else null.
    userId: text("user_id"),
    // Staff member the request is assigned to (admin-set).
    assignedTo: text("assigned_to"),
    // Internal staff note (admin-set); never shown publicly.
    staffNote: text("staff_note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("privacy_requests_reference_uq").on(table.reference),
    index("privacy_requests_status_idx").on(table.status),
    index("privacy_requests_created_at_idx").on(table.createdAt),
  ],
);

export type PrivacyRequest = typeof privacyRequests.$inferSelect;
export type NewPrivacyRequest = typeof privacyRequests.$inferInsert;

/**
 * Published policy versions managed by staff (reference 02 §6). This is the
 * runtime override + history for the built-in baselines in lib/legal/policies.
 * Publishing a new row (status "current") supersedes the baseline for that
 * policy type/locale; previous versions are kept, never overwritten.
 */
export const POLICY_PUBLICATION_STATUSES = ["draft", "current", "retired"] as const;

export const policyPublications = sqliteTable(
  "policy_publications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Policy type, e.g. "privacy" | "terms" | "cookies" | "refunds" | ...
    policyType: text("policy_type").notNull(),
    locale: text("locale").notNull().default("en"),
    version: text("version").notNull(),
    status: text("status").notNull().default("draft"),
    // Whether this release is a material change requiring re-acknowledgement.
    materialChange: integer("material_change", { mode: "boolean" })
      .notNull()
      .default(false),
    effectiveAt: text("effective_at"),
    // Serialized localized policy document (title/scope/sections) as JSON.
    content: text("content").notNull(),
    publishedBy: text("published_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("policy_pub_type_locale_idx").on(table.policyType, table.locale),
    index("policy_pub_status_idx").on(table.status),
  ],
);

export type PolicyPublication = typeof policyPublications.$inferSelect;
export type NewPolicyPublication = typeof policyPublications.$inferInsert;
