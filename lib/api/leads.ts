// Lead creation core logic, shared by the canonical POST /api/v1/leads route and
// the backward-compatible POST /api/enquiries alias. Keeping the business logic
// here guarantees both paths behave identically (handoff: no divergent copies).

import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  ENQUIRY_KINDS,
  ENQUIRY_PRODUCTS,
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

export const LEADS_SCOPE = "POST /api/v1/leads";

const localeSchema = z.enum(["en", "ar"]).default("en").catch("en");

/**
 * Canonical lead payload (handoff section 14.1). `kind` is the canonical field;
 * the alias maps its legacy `category` onto it before calling in.
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

  try {
    await db.transaction(async (tx) => {
      await tx.insert(enquiries).values({
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
      });

      await tx.insert(outboxEvents).values({
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
      });
    });
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
