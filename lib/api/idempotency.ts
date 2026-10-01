// Idempotency handling for v1 write endpoints (handoff section 13).
//
// Contract:
//   - A reused key with the SAME normalized body replays the stored response.
//   - A reused key with a DIFFERENT body returns 409 conflict.
//   - Two concurrent requests with the same key: exactly one performs the side
//     effect; the other observes the in-flight / completed record and does not
//     repeat it.
//
// The concurrency guard is the composite primary key (scope, actor, key) on the
// `idempotency_keys` table. The first INSERT wins; a racing INSERT fails the
// unique constraint, and that loser then reads the winner's record instead of
// running the business logic again.

import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { idempotencyKeys } from "@/db/schema";
import * as schema from "@/db/schema";

export type Db = DrizzleD1Database<typeof schema>;

const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** SHA-256 hex of a string, using the Workers-available WebCrypto. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable hash of a JSON body: key order does not matter. */
export async function hashBody(body: unknown): Promise<string> {
  return sha256Hex(stableStringify(body));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export type ReservationReplay = {
  outcome: "replay";
  responseStatus: number;
  responseBody: string;
};
export type ReservationConflict = {
  outcome: "conflict";
  reason: "body_mismatch" | "in_flight";
};
export type ReservationProceed = {
  outcome: "proceed";
  /** Call after the side effect to persist the response for future replays. */
  complete: (responseStatus: number, responseBody: string) => Promise<void>;
};

export type Reservation = ReservationReplay | ReservationConflict | ReservationProceed;

function expiry(nowMs: number): string {
  return new Date(nowMs + KEY_TTL_MS).toISOString();
}

/**
 * Reserve an idempotency key. Returns:
 *   - proceed  : caller is the first; run the side effect then call complete()
 *   - replay   : identical request already completed; return the stored response
 *   - conflict : same key, different body (body_mismatch) or still in flight
 */
export async function reserveIdempotencyKey(
  db: Db,
  params: { key: string; scope: string; actor: string; requestHash: string },
): Promise<Reservation> {
  const { key, scope, actor, requestHash } = params;
  const nowMs = Date.now();

  // Attempt to claim the key. onConflictDoNothing means a racing/duplicate
  // insert affects zero rows, which we detect by reading back the row.
  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      key,
      scope,
      actor,
      requestHash,
      status: "processing",
      expiresAt: expiry(nowMs),
    })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (inserted.length > 0) {
    // We own the key. Hand back a completer that records the response.
    return {
      outcome: "proceed",
      complete: async (responseStatus: number, responseBody: string) => {
        await db
          .update(idempotencyKeys)
          .set({ status: "completed", responseStatus, responseBody })
          .where(
            and(
              eq(idempotencyKeys.scope, scope),
              eq(idempotencyKeys.actor, actor),
              eq(idempotencyKeys.key, key),
            ),
          );
      },
    };
  }

  // Someone else already claimed the key — read their record.
  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.scope, scope),
        eq(idempotencyKeys.actor, actor),
        eq(idempotencyKeys.key, key),
      ),
    )
    .limit(1);

  const row = existing[0];
  if (!row) {
    // Extremely unlikely race (row deleted between insert and select). Treat as
    // in-flight conflict so the client retries rather than double-submitting.
    return { outcome: "conflict", reason: "in_flight" };
  }

  if (row.requestHash !== requestHash) {
    return { outcome: "conflict", reason: "body_mismatch" };
  }

  if (row.status === "completed" && row.responseStatus != null && row.responseBody != null) {
    return {
      outcome: "replay",
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
    };
  }

  // Same body, but the first request has not finished writing its response yet.
  return { outcome: "conflict", reason: "in_flight" };
}
