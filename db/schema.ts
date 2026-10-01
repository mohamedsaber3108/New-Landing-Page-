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
