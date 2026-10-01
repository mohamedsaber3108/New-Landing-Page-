// Transactional-outbox delivery worker (handoff §18 "Jobs and synchronization").
//
// A business write stores a `lead.created` (etc.) event in `outbox_events` in
// the same transaction as the business row. This worker later delivers those
// pending events to the configured notification channel. It is intentionally a
// SCAFFOLD with an honest disabled state:
//
//   - If no channel is configured (no USAM_LEAD_NOTIFY_* env), the worker is a
//     no-op and reports `disabled`. Events stay `pending` and are never lost.
//   - If a webhook is configured, it POSTs each event, with bounded retries and
//     dead-lettering. (Email delivery is left as a documented integration point;
//     wiring a provider is a GATED task requiring credentials.)
//
// This module performs no automatic scheduling. It is driven explicitly (an
// admin trigger route, or a future Cloudflare Cron/Queue consumer). That keeps
// activation a deliberate, flagged decision rather than a hidden side effect.

import { and, asc, eq, lte } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { getDb } from "@/db";
import { outboxEvents } from "@/db/schema";
import * as schema from "@/db/schema";

type Db = DrizzleD1Database<typeof schema>;

const MAX_ATTEMPTS = 5;

type Env = Record<string, string | undefined>;
function readEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
}

export type ChannelConfig =
  | { kind: "webhook"; url: string }
  | { kind: "email"; address: string }
  | { kind: "none" };

/** Resolve the configured delivery channel from env (names only, no secrets committed). */
export function resolveChannel(env: Env = readEnv()): ChannelConfig {
  if (env.USAM_LEAD_NOTIFY_WEBHOOK) return { kind: "webhook", url: env.USAM_LEAD_NOTIFY_WEBHOOK };
  if (env.USAM_LEAD_NOTIFY_EMAIL) return { kind: "email", address: env.USAM_LEAD_NOTIFY_EMAIL };
  return { kind: "none" };
}

export type ProcessResult = {
  status: "disabled" | "ran";
  channel: ChannelConfig["kind"];
  claimed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  note?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function backoffIso(attempts: number): string {
  // Exponential backoff with a cap (seconds): 2,4,8,16,32… capped at 300.
  const seconds = Math.min(2 ** attempts, 300);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Process a batch of due pending outbox events. Safe to call repeatedly; it only
 * claims events whose `nextAttemptAt` is due. Returns a summary.
 */
export async function processOutboxBatch(opts: { limit?: number } = {}): Promise<ProcessResult> {
  const channel = resolveChannel();
  if (channel.kind === "none") {
    return {
      status: "disabled",
      channel: "none",
      claimed: 0,
      delivered: 0,
      failed: 0,
      deadLettered: 0,
      note: "No notification channel configured (set USAM_LEAD_NOTIFY_WEBHOOK or USAM_LEAD_NOTIFY_EMAIL). Events remain pending.",
    };
  }
  if (channel.kind === "email") {
    // Honest boundary: email requires an approved provider + credentials.
    return {
      status: "disabled",
      channel: "email",
      claimed: 0,
      delivered: 0,
      failed: 0,
      deadLettered: 0,
      note: "Email channel is a documented integration point; wiring a provider is a gated task. Events remain pending.",
    };
  }

  const db = getDb() as unknown as Db;
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const due = await db
    .select()
    .from(outboxEvents)
    .where(and(eq(outboxEvents.status, "pending"), lte(outboxEvents.nextAttemptAt, nowIso())))
    .orderBy(asc(outboxEvents.nextAttemptAt), asc(outboxEvents.id))
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const event of due) {
    // Mark delivering (best-effort lease). A single worker per trigger keeps
    // this simple; a Queue consumer would add a visibility timeout.
    await db
      .update(outboxEvents)
      .set({ status: "delivering" })
      .where(eq(outboxEvents.id, event.id));

    try {
      const response = await fetch(channel.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          schemaVersion: event.schemaVersion,
          occurredAt: event.createdAt,
          aggregateRef: event.aggregateRef,
          data: safeJson(event.payload),
        }),
      });
      if (!response.ok) throw new Error(`delivery responded ${response.status}`);

      await db
        .update(outboxEvents)
        .set({ status: "delivered", deliveredAt: nowIso() })
        .where(eq(outboxEvents.id, event.id));
      delivered++;
    } catch (error) {
      const attempts = event.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      await db
        .update(outboxEvents)
        .set({
          status: dead ? "dead_letter" : "pending",
          attempts,
          lastError: (error instanceof Error ? error.message : "delivery failed").slice(0, 500),
          nextAttemptAt: dead ? event.nextAttemptAt : backoffIso(attempts),
        })
        .where(eq(outboxEvents.id, event.id));
      if (dead) deadLettered++;
      else failed++;
    }
  }

  return {
    status: "ran",
    channel: channel.kind,
    claimed: due.length,
    delivered,
    failed,
    deadLettered,
  };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
