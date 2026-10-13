// Lead creation core logic, shared by the canonical POST /api/v1/leads route and
// the backward-compatible POST /api/enquiries alias. Keeping the business logic
// here guarantees both paths behave identically (handoff: no divergent copies).

import { z } from "zod";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  BUDGET_RANGES,
  ENQUIRY_KINDS,
  ENQUIRY_PRODUCTS,
  ENTERPRISE_ENQUIRY_TYPES,
  GOVERNMENT_INITIATIVE_TYPES,
  PARTICIPANT_RANGES,
  TIMELINE_OPTIONS,
  enquiries,
  outboxEvents,
} from "@/db/schema";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  cryptoRandomId,
  newReference,
  type ApiErrorCode,
  type FieldErrors,
} from "./envelope";
import { hashBody, reserveIdempotencyKey, type Db } from "./idempotency";
import { consentInsertStatements, type RecordConsentInput } from "./consent";
import { getPolicyRequirement } from "@/lib/legal/store";

export const LEADS_SCOPE = "POST /api/v1/leads";

const localeSchema = z.enum(["en", "ar"]).default("en").catch("en");

// Structured enterprise/government enquiry type (one combined enum keeps the
// column flexible; the forms constrain which values they send).
const enquiryTypeSchema = z
  .enum([...ENTERPRISE_ENQUIRY_TYPES, ...GOVERNMENT_INITIATIVE_TYPES] as [string, ...string[]])
  .nullish();

/**
 * Optional structured block for enterprise/government enquiries. Every field is
 * optional so the Contact form (which omits `structured` entirely) is
 * unaffected. Controlled vocabularies are validated against the schema enums;
 * free-ish fields are length-bounded.
 */
export const structuredEnquirySchema = z
  .object({
    role: z.string().trim().max(120).nullish(),
    phone: z.string().trim().max(40).nullish(),
    country: z.string().trim().max(80).nullish(),
    enquiryType: enquiryTypeSchema,
    participantRange: z.enum(PARTICIPANT_RANGES).nullish(),
    timeline: z.enum(TIMELINE_OPTIONS).nullish(),
    budgetRange: z.enum(BUDGET_RANGES).nullish(),
    beneficiaries: z.string().trim().max(600).nullish(),
    privacyNoticeVersion: z.string().trim().max(40).nullish(),
    privacyAcknowledged: z.boolean().optional(),
    // Terms-of-Service acceptance (required by the forms that show the box).
    // Enforced server-side: when the client declares the box was shown
    // (`termsPresented`), acceptance must be true or the request is rejected.
    termsAccepted: z.boolean().optional(),
    termsPresented: z.boolean().optional(),
    termsVersion: z.string().trim().max(40).nullish(),
  })
  .strict();

/**
 * Canonical lead payload (handoff section 14.1). `kind` is the canonical field;
 * the alias maps its legacy `category` onto it before calling in. `structured`
 * is optional and only used by the enterprise/government forms.
 */
export const createLeadSchema = z.object({
  name: z.string().trim().min(2, "name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("a valid email is required").max(254),
  kind: z.enum(ENQUIRY_KINDS).default("general").catch("general"),
  product: z.enum(ENQUIRY_PRODUCTS).nullish(),
  organization: z.string().trim().max(200).nullish(),
  locale: localeSchema,
  message: z
    .string()
    .trim()
    .min(10, "message must be at least 10 characters")
    .max(4000),
  marketingOptIn: z.boolean().default(false).catch(false),
  structured: structuredEnquirySchema.optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export type LeadResult =
  | {
      ok: true;
      status: number;
      body: {
        reference: string;
        status: string;
        notificationStatus: "pending" | "delivered" | "not_configured";
      };
    }
  | {
      ok: false;
      status: number;
      error: { code: ApiErrorCode; message: string; fieldErrors?: FieldErrors; retryable?: boolean };
    };

export function flattenFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Whether a notification channel (email/CRM) is configured. Until operations
 * supply one, outbox events stay `pending` and we report that honestly rather
 * than claim delivery. Env var name is a placeholder interface, not a secret.
 */
export function notificationChannelConfigured(): boolean {
  // Read from the Worker/process env without assuming a specific provider.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return Boolean(env.USAM_LEAD_NOTIFY_WEBHOOK || env.USAM_LEAD_NOTIFY_EMAIL);
}

/**
 * Create a lead durably: insert the enquiry row AND its `lead.created` outbox
 * event in a single transaction. Notification delivery happens later out of
 * band; a missing channel never fails the capture.
 *
 * Idempotency: when `idempotencyKey` is provided, concurrent/duplicate requests
 * with the same key return the first stored response (or 409 on body mismatch).
 */
export async function createLead(args: {
  input: CreateLeadInput;
  idempotencyKey?: string | null;
}): Promise<LeadResult> {
  const { input, idempotencyKey } = args;
  const s0 = input.structured;

  // Determine the REAL Terms requirement from the published state — never from
  // the client. The Master may only require (and record) Terms acceptance when
  // an APPROVED, published Terms version exists consistently in EN and AR
  // (instruction §1/§7). While Terms are still draft, submission must stay
  // usable with a privacy NOTICE instead of a contractual acceptance gate, and
  // no draft acceptance is recorded as valid.
  const termsReq = await getPolicyRequirement("terms");

  // Server-side enforcement: only when Terms are genuinely published do we
  // require the box to be ticked. A client claiming termsPresented against a
  // draft cannot create a bogus contractual record, and a client omitting it
  // when Terms ARE published cannot bypass the requirement.
  if (termsReq.required && s0?.termsAccepted !== true) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "validation_failed",
        message: "You must accept the Terms of Service to continue.",
        fieldErrors: { "structured.termsAccepted": ["Terms acceptance is required."] },
      },
    };
  }

  const user = await getChatGPTUser().catch(() => null);
  const actor = user?.userId ?? "anonymous";

  let db: Db;
  try {
    db = getDb() as unknown as Db;
  } catch (error) {
    return dependencyError(error);
  }

  const requestHash = await hashBody(input);

  // --- Idempotency reservation (if a key was supplied) ---------------------
  let complete: ((status: number, body: string) => Promise<void>) | null = null;
  if (idempotencyKey) {
    try {
      const reservation = await reserveIdempotencyKey(db, {
        key: idempotencyKey,
        scope: LEADS_SCOPE,
        actor,
        requestHash,
      });
      if (reservation.outcome === "replay") {
        return {
          ok: true,
          status: reservation.responseStatus,
          body: JSON.parse(reservation.responseBody),
        };
      }
      if (reservation.outcome === "conflict") {
        return {
          ok: false,
          status: 409,
          error: {
            code: "conflict",
            message:
              reservation.reason === "body_mismatch"
                ? "This Idempotency-Key was already used with a different request body."
                : "A request with this Idempotency-Key is already being processed.",
            retryable: reservation.reason === "in_flight",
          },
        };
      }
      complete = reservation.complete;
    } catch (error) {
      return dependencyError(error);
    }
  }

  // --- Durable write: lead + outbox event in one transaction ---------------
  const reference = newReference();
  const eventId = `evt_${cryptoRandomId(20)}`;
  const s = input.structured;
  // Record a privacy ACKNOWLEDGEMENT timestamp only when the privacy policy is
  // actually published AND the submitter acknowledged it. A draft notice that
  // was merely presented is not an acknowledgement, so this stays null then.

  // Build distinct consent/acceptance evidence events for this submission. They
  // are written in the SAME batch as the lead so the evidence is atomic with
  // the enquiry (ref 02 §5). Each event is accurate: we NEVER record acceptance
  // of a draft as valid, and we NEVER mark marketing granted when unchecked.
  const purpose = `${input.kind}_enquiry`;
  const privacyReq = await getPolicyRequirement("privacy");
  const consentInputs: RecordConsentInput[] = [];

  // Terms: only recordable as acceptance when Terms are published. We stamp the
  // SERVER's published version (termsReq.version), not a client-supplied one.
  if (termsReq.required && s?.termsAccepted === true) {
    consentInputs.push({
      eventType: "terms_acceptance",
      purpose,
      status: "granted",
      policyType: "terms",
      policyVersion: termsReq.version,
      actor,
      subjectRef: reference,
      method: `${input.kind}-form`,
      locale: input.locale,
    });
  }

  // Privacy: if the privacy policy is published, a ticked box is an
  // acknowledgement; otherwise we only record that the privacy NOTICE was
  // PRESENTED (a notice, not consent). Either way, stamp the server's version
  // when published so evidence matches what was served.
  if (privacyReq.required && s?.privacyAcknowledged === true) {
    consentInputs.push({
      eventType: "privacy_acknowledgement",
      purpose,
      status: "granted",
      policyType: "privacy",
      policyVersion: privacyReq.version,
      actor,
      subjectRef: reference,
      method: `${input.kind}-form`,
      locale: input.locale,
    });
  } else {
    // Notice presentation is always recorded for a submission — it documents
    // that the privacy notice link was shown, without implying consent.
    consentInputs.push({
      eventType: "privacy_notice_presented",
      purpose,
      status: "granted",
      policyType: "privacy",
      policyVersion: privacyReq.required ? privacyReq.version : null,
      actor,
      subjectRef: reference,
      method: `${input.kind}-form`,
      locale: input.locale,
    });
  }

  // Marketing is always recorded as a distinct event: granted when opted in,
  // denied when the (unchecked) optional box was left off — so a later audit
  // shows an explicit decision, and withdrawal can supersede it.
  consentInputs.push({
    eventType: "marketing_consent",
    purpose: "marketing_updates",
    status: input.marketingOptIn ? "granted" : "denied",
    actor,
    subjectRef: reference,
    method: `${input.kind}-form`,
    locale: input.locale,
  });

  // Cloudflare D1 does NOT support Drizzle's interactive db.transaction()
  // (it throws at runtime). D1 provides atomic multi-statement writes via
  // db.batch([...]) — the whole batch commits or rolls back together. We write
  // the lead row and its lead.created outbox event as one atomic batch.
  try {
    await db.batch([
      db.insert(enquiries).values({
        reference,
        userId: user?.userId ?? null,
        name: input.name,
        email: input.email,
        kind: input.kind,
        product: input.product ?? null,
        organization: input.organization ?? null,
        locale: input.locale,
        message: input.message,
        marketingOptIn: input.marketingOptIn,
        status: "received",
        // Structured fields (null for the Contact form).
        role: s?.role ?? null,
        phone: s?.phone ?? null,
        country: s?.country ?? null,
        enquiryType: s?.enquiryType ?? null,
        participantRange: s?.participantRange ?? null,
        timeline: s?.timeline ?? null,
        budgetRange: s?.budgetRange ?? null,
        beneficiaries: s?.beneficiaries ?? null,
        // Server-derived: record the published privacy version served (or null
        // if privacy is still draft), and an acknowledgement timestamp only
        // when privacy is published AND the box was ticked.
        privacyNoticeVersion: privacyReq.required ? privacyReq.version : null,
        privacyAcknowledgedAt:
          privacyReq.required && s?.privacyAcknowledged === true
            ? new Date().toISOString()
            : null,
        details: null,
      }),
      db.insert(outboxEvents).values({
        eventId,
        eventType: "lead.created",
        schemaVersion: 1,
        aggregateRef: reference,
        // Reference-only payload; no message body duplicated into the event.
        payload: JSON.stringify({
          reference,
          kind: input.kind,
          product: input.product ?? null,
          locale: input.locale,
        }),
        status: "pending",
      }),
      // Consent/acceptance evidence, atomic with the lead.
      ...consentInsertStatements(db, consentInputs),
    ]);
  } catch (error) {
    return dependencyError(error);
  }

  const notificationStatus = notificationChannelConfigured() ? "pending" : "not_configured";
  const body = { reference, status: "received", notificationStatus } as const;

  if (complete) {
    // Persist the response so retries with the same key replay it exactly.
    await complete(201, JSON.stringify(body)).catch(() => {
      // A failure to record the idempotency response must not undo the lead.
    });
  }

  return { ok: true, status: 201, body: { ...body } };
}

/** List the signed-in owner's own leads (handoff: enquiry contents are private). */
export async function listOwnLeads(): Promise<
  | { ok: true; leads: Array<Record<string, unknown>> }
  | { ok: false; status: number; error: { code: ApiErrorCode; message: string } }
> {
  const user = await getChatGPTUser().catch(() => null);
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: { code: "unauthenticated", message: "Sign in with ChatGPT to view your enquiries." },
    };
  }
  try {
    const db = getDb() as unknown as Db;
    const rows = await db
      .select({
        reference: enquiries.reference,
        kind: enquiries.kind,
        product: enquiries.product,
        organization: enquiries.organization,
        enquiryType: enquiries.enquiryType,
        country: enquiries.country,
        participantRange: enquiries.participantRange,
        timeline: enquiries.timeline,
        budgetRange: enquiries.budgetRange,
        status: enquiries.status,
        locale: enquiries.locale,
        createdAt: enquiries.createdAt,
      })
      .from(enquiries)
      .where(eq(enquiries.userId, user.userId))
      .orderBy(desc(enquiries.createdAt), desc(enquiries.id))
      .limit(50);
    return { ok: true, leads: rows };
  } catch (error) {
    const d = dependencyError(error);
    return { ok: false, status: d.status, error: d.error };
  }
}

/**
 * Staff-only: list ALL enquiries (including anonymous enterprise/government
 * submissions that have no owner). This is the authoritative inbox for the
 * team. It must only be called from a route that has already passed admin
 * authorization — it performs no auth itself. Supports simple filtering by
 * `kind` and cursor-less pagination via `limit`/`beforeId`.
 */
export async function listAllLeads(opts: {
  kind?: string | null;
  limit?: number;
  beforeId?: number | null;
}): Promise<
  | { ok: true; leads: Array<Record<string, unknown>> }
  | { ok: false; status: number; error: { code: ApiErrorCode; message: string } }
> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  try {
    const db = getDb() as unknown as Db;
    const base = db
      .select({
        id: enquiries.id,
        reference: enquiries.reference,
        createdAt: enquiries.createdAt,
        kind: enquiries.kind,
        status: enquiries.status,
        name: enquiries.name,
        email: enquiries.email,
        organization: enquiries.organization,
        role: enquiries.role,
        phone: enquiries.phone,
        country: enquiries.country,
        product: enquiries.product,
        enquiryType: enquiries.enquiryType,
        participantRange: enquiries.participantRange,
        timeline: enquiries.timeline,
        budgetRange: enquiries.budgetRange,
        beneficiaries: enquiries.beneficiaries,
        message: enquiries.message,
        marketingOptIn: enquiries.marketingOptIn,
        privacyNoticeVersion: enquiries.privacyNoticeVersion,
        privacyAcknowledgedAt: enquiries.privacyAcknowledgedAt,
        userId: enquiries.userId,
      })
      .from(enquiries);

    const conditions = [];
    if (opts.kind) conditions.push(eq(enquiries.kind, opts.kind));
    if (opts.beforeId != null) conditions.push(lt(enquiries.id, opts.beforeId));

    const rows = await (conditions.length
      ? base.where(and(...conditions))
      : base
    )
      .orderBy(desc(enquiries.id))
      .limit(limit);

    return { ok: true, leads: rows };
  } catch (error) {
    const d = dependencyError(error);
    return { ok: false, status: d.status, error: d.error };
  }
}

function dependencyError(error: unknown): Extract<LeadResult, { ok: false }> {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;
  if (combined.includes("`DB` is unavailable")) {
    return {
      ok: false,
      status: 503,
      error: {
        code: "dependency_unavailable",
        message:
          "Database binding `DB` is not configured. Set `d1` to `DB` in .openai/hosting.json and rebuild.",
        retryable: true,
      },
    };
  }
  if (combined.includes("no such table") || combined.includes("enquiries") || combined.includes("outbox")) {
    return {
      ok: false,
      status: 503,
      error: {
        code: "dependency_unavailable",
        message:
          "Lead storage is unavailable. Run `npm run db:generate` and apply the migration to the D1 database.",
        retryable: true,
      },
    };
  }
  return {
    ok: false,
    status: 500,
    error: { code: "internal_error", message: "An unexpected error occurred.", retryable: false },
  };
}
