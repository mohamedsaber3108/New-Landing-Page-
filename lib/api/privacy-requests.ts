// Privacy / data-subject request capture + staff workflow (ref 02 §10, §27).
//
// A request is stored with a public receipt reference and a `lead.created`-style
// outbox event so the team is notified through the same durable channel as
// leads. Fulfilment is gated on identity verification handled by staff — this
// module never discloses, exports, or deletes data on the strength of a form
// submission. Those actions are staff-driven through the admin endpoint.

import { z } from "zod";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_REQUEST_TYPES,
  outboxEvents,
  privacyRequests,
} from "@/db/schema";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { cryptoRandomId, newReference, type ApiErrorCode, type FieldErrors } from "./envelope";
import { hashBody, reserveIdempotencyKey, type Db } from "./idempotency";

export const PRIVACY_REQUEST_SCOPE = "POST /api/v1/privacy-requests";

const localeSchema = z.enum(["en", "ar"]).default("en").catch("en");

export const createPrivacyRequestSchema = z.object({
  requestType: z.enum(PRIVACY_REQUEST_TYPES),
  name: z.string().trim().min(2, "name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("a valid email is required").max(254),
  relatedReference: z.string().trim().max(60).nullish(),
  locale: localeSchema,
  message: z.string().trim().max(2000).nullish(),
});

export type CreatePrivacyRequestInput = z.infer<typeof createPrivacyRequestSchema>;

export function flattenFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

export type PrivacyRequestResult =
  | { ok: true; status: number; body: { reference: string; status: string } }
  | { ok: false; status: number; error: { code: ApiErrorCode; message: string; retryable?: boolean } };

export async function createPrivacyRequest(args: {
  input: CreatePrivacyRequestInput;
  idempotencyKey?: string | null;
}): Promise<PrivacyRequestResult> {
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
  let complete: ((status: number, body: string) => Promise<void>) | null = null;
  if (idempotencyKey) {
    try {
      const reservation = await reserveIdempotencyKey(db, {
        key: idempotencyKey,
        scope: PRIVACY_REQUEST_SCOPE,
        actor,
        requestHash,
      });
      if (reservation.outcome === "replay") {
        return { ok: true, status: reservation.responseStatus, body: JSON.parse(reservation.responseBody) };
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

  const reference = newReference("PRQ");
  const eventId = `evt_${cryptoRandomId(20)}`;

  try {
    await db.batch([
      db.insert(privacyRequests).values({
        reference,
        requestType: input.requestType,
        status: "received",
        identityVerified: false,
        name: input.name,
        email: input.email,
        relatedReference: input.relatedReference ?? null,
        locale: input.locale,
        message: input.message ?? null,
        userId: user?.userId ?? null,
      }),
      db.insert(outboxEvents).values({
        eventId,
        eventType: "privacy_request.created",
        schemaVersion: 1,
        aggregateRef: reference,
        payload: JSON.stringify({ reference, requestType: input.requestType, locale: input.locale }),
        status: "pending",
      }),
    ]);
  } catch (error) {
    return dependencyError(error);
  }

  const body = { reference, status: "received" } as const;
  if (complete) {
    await complete(201, JSON.stringify(body)).catch(() => {});
  }
  return { ok: true, status: 201, body: { ...body } };
}

/** Staff: list privacy requests for the admin queue. */
export async function listPrivacyRequests(opts: {
  status?: string | null;
  limit?: number;
  beforeId?: number | null;
}): Promise<
  | { ok: true; requests: Array<Record<string, unknown>> }
  | { ok: false; status: number; error: { code: ApiErrorCode; message: string } }
> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  try {
    const db = getDb() as unknown as Db;
    const base = db.select().from(privacyRequests);
    const conditions = [];
    if (opts.status) conditions.push(eq(privacyRequests.status, opts.status));
    if (opts.beforeId != null) conditions.push(lt(privacyRequests.id, opts.beforeId));
    const rows = await (conditions.length ? base.where(and(...conditions)) : base)
      .orderBy(desc(privacyRequests.id))
      .limit(limit);
    return { ok: true, requests: rows };
  } catch (error) {
    const d = dependencyError(error);
    return { ok: false, status: d.status, error: d.error };
  }
}

export const updatePrivacyRequestSchema = z.object({
  reference: z.string().trim().min(3).max(60),
  status: z.enum(PRIVACY_REQUEST_STATUSES).optional(),
  identityVerified: z.boolean().optional(),
  assignedTo: z.string().trim().max(120).nullish(),
  staffNote: z.string().trim().max(2000).nullish(),
});

export type UpdatePrivacyRequestInput = z.infer<typeof updatePrivacyRequestSchema>;

/**
 * Allowed status transitions (ref 02 §10 workflow). Terminal states
 * (completed, rejected) accept no further transition. A request may be rejected
 * from any non-terminal state. Normal progression moves forward through the
 * lifecycle; it may not skip straight to a fulfilment/terminal state.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  received: ["identity_verification", "in_review", "rejected"],
  identity_verification: ["in_review", "rejected"],
  in_review: ["action_in_progress", "completed", "rejected"],
  action_in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

/** Statuses at which a disclosure/deletion action actually happens. */
const FULFILMENT_STATUSES = new Set(["action_in_progress", "completed"]);
/** Request types whose fulfilment discloses or deletes personal data. */
const SENSITIVE_TYPES = new Set(["access", "correction", "deletion"]);

/** Staff: update a request's workflow fields, enforcing the state machine. */
export async function updatePrivacyRequest(input: UpdatePrivacyRequestInput): Promise<
  | { ok: true; updated: boolean }
  | { ok: false; status: number; error: { code: ApiErrorCode; message: string } }
> {
  let db: Db;
  try {
    db = getDb() as unknown as Db;
  } catch (error) {
    const d = dependencyError(error);
    return { ok: false, status: d.status, error: d.error };
  }

  // Load the current row first so transitions are validated against real state.
  let current: typeof privacyRequests.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.reference, input.reference))
      .limit(1);
    current = rows[0];
  } catch (error) {
    const d = dependencyError(error);
    return { ok: false, status: d.status, error: d.error };
  }
  if (!current) return { ok: true, updated: false };

  // Resolve what identity-verification will be after this patch.
  const verifiedAfter =
    input.identityVerified !== undefined ? input.identityVerified : current.identityVerified;

  if (input.status !== undefined && input.status !== current.status) {
    const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(input.status)) {
      return {
        ok: false,
        status: 409,
        error: {
          code: "conflict",
          message: `Invalid status transition: ${current.status} → ${input.status}.`,
        },
      };
    }
    // Fulfilment gate: a sensitive request may NOT reach a disclosure/deletion
    // status unless identity has been verified. This is the hard guard that
    // prevents acting on an email address alone.
    if (
      FULFILMENT_STATUSES.has(input.status) &&
      SENSITIVE_TYPES.has(current.requestType) &&
      !verifiedAfter
    ) {
      return {
        ok: false,
        status: 422,
        error: {
          code: "validation_failed",
          message:
            "Identity must be verified before a disclosure/deletion request can be actioned or completed.",
        },
      };
    }
  }

  try {
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.status !== undefined) patch.status = input.status;
    if (input.identityVerified !== undefined) patch.identityVerified = input.identityVerified;
    if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo ?? null;
    if (input.staffNote !== undefined) patch.staffNote = input.staffNote ?? null;

    const res = await db
      .update(privacyRequests)
      .set(patch)
      .where(eq(privacyRequests.reference, input.reference))
      .returning({ reference: privacyRequests.reference });
    return { ok: true, updated: res.length > 0 };
  } catch (error) {
    const d = dependencyError(error);
    return { ok: false, status: d.status, error: d.error };
  }
}

function dependencyError(error: unknown): Extract<PrivacyRequestResult, { ok: false }> {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;
  if (combined.includes("`DB` is unavailable")) {
    return {
      ok: false,
      status: 503,
      error: {
        code: "dependency_unavailable",
        message: "Database binding `DB` is not configured.",
        retryable: true,
      },
    };
  }
  if (combined.includes("no such table") || combined.includes("privacy_requests")) {
    return {
      ok: false,
      status: 503,
      error: {
        code: "dependency_unavailable",
        message: "Privacy request storage is unavailable. Apply the latest migration to D1.",
        retryable: true,
      },
    };
  }
  return {
    ok: false,
    status: 500,
    error: { code: "internal_error", message: "An unexpected error occurred." },
  };
}
