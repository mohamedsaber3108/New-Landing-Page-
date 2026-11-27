// Transactional-outbox delivery worker (handoff §18 "Jobs and synchronization").
//
// A business write stores a `lead.created` (etc.) event in `outbox_events` in
// the same transaction as the business row. This worker later delivers those
// pending events to the configured notification channel. It is intentionally a
// SCAFFOLD with an honest disabled state:
//
//   - If no channel is configured (no USAM_LEAD_NOTIFY_* env), the worker is a
//     no-op and reports `disabled`. Events stay `pending` and are never lost.
//   - If a webhook is configured, it POSTs one short message per event
//     ({ id, type, text }, see notificationMessage: no personal data), with
//     bounded retries and dead-lettering. (Email delivery is left as a documented integration point;
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
/** A claimed ("delivering") event is picked up again if not finished within this time. */
const LEASE_MS = 10 * 60_000;

type Env = Record<string, string | undefined>;
function readEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
}

export type ChannelConfig =
  | { kind: "webhook"; url: string }
  | { kind: "email"; address: string }
  | { kind: "none"; invalidWebhook?: true };

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolve the configured delivery channel from env (names only, no secrets committed). */
export function resolveChannel(env: Env = readEnv()): ChannelConfig {
  if (env.USAM_LEAD_NOTIFY_WEBHOOK) {
    // https only. Anything else is treated as not configured (events stay pending).
    return isHttpsUrl(env.USAM_LEAD_NOTIFY_WEBHOOK)
      ? { kind: "webhook", url: env.USAM_LEAD_NOTIFY_WEBHOOK }
      : { kind: "none", invalidWebhook: true };
  }
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
  /** Whole-outbox counts after this run; null when the DB cannot be read. */
  totals: { pending: number; deadLetter: number } | null;
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
      totals: await safeTotals(),
      note: channel.invalidWebhook
        ? "USAM_LEAD_NOTIFY_WEBHOOK is not an https:// URL, so it is ignored. Events remain pending."
        : "No notification channel configured (set USAM_LEAD_NOTIFY_WEBHOOK or USAM_LEAD_NOTIFY_EMAIL). Events remain pending.",
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
      totals: await safeTotals(),
      note: "Email channel is a documented integration point; wiring a provider is a gated task. Events remain pending.",
    };
  }

  const db = getDb() as unknown as Db;
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const now = nowIso();

  // Due pending events, plus "delivering" events whose lease ran out (the
  // worker crashed mid-send). While delivering, nextAttemptAt holds the lease end.
  const dueWhere = (status: string) =>
    and(eq(outboxEvents.status, status), lte(outboxEvents.nextAttemptAt, now));
  const pendingDue = await db
    .select()
    .from(outboxEvents)
    .where(dueWhere("pending"))
    .orderBy(asc(outboxEvents.nextAttemptAt), asc(outboxEvents.id))
    .limit(limit);
  const staleLeases = await db
    .select()
    .from(outboxEvents)
    .where(dueWhere("delivering"))
    .orderBy(asc(outboxEvents.nextAttemptAt), asc(outboxEvents.id))
    .limit(limit);
  const due = [...staleLeases, ...pendingDue].slice(0, limit);

  let claimed = 0;
  let delivered = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const event of due) {
    // Claim only if nobody else did since we read it (same status and lease
    // value). An overlapping run then finds zero rows and skips the event.
    const won = await db
      .update(outboxEvents)
      .set({ status: "delivering", nextAttemptAt: new Date(Date.now() + LEASE_MS).toISOString() })
      .where(
        and(
          eq(outboxEvents.id, event.id),
          eq(outboxEvents.status, event.status),
          eq(outboxEvents.nextAttemptAt, event.nextAttemptAt),
        ),
      )
      .returning({ id: outboxEvents.id });
    if (won.length === 0) continue;
    claimed++;

    try {
      const response = await fetch(channel.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Lets the receiver drop a duplicate if a retry follows a lost reply.
          "X-USAM-Event-Id": event.eventId,
        },
        body: JSON.stringify(notificationMessage(event)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new DeliveryError(`delivery responded ${response.status}`);

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
          lastError: safeErrorText(error),
          nextAttemptAt: dead ? now : backoffIso(attempts),
        })
        .where(eq(outboxEvents.id, event.id));
      if (dead) deadLettered++;
      else failed++;
    }
  }

  return {
    status: "ran",
    channel: channel.kind,
    claimed,
    delivered,
    failed,
    deadLettered,
    totals: await outboxTotals(db),
  };
}

/** Error raised for a non-2xx reply; its message is safe to store. */
class DeliveryError extends Error {}

/**
 * Text stored in outbox_events.last_error. Never the raw message of a fetch
 * error: some runtimes put the target URL in it, and the webhook URL is a secret.
 */
function safeErrorText(error: unknown): string {
  if (error instanceof DeliveryError) return error.message; // "delivery responded <status>"
  const name = error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "Error";
  return `delivery failed (${name})`;
}

/**
 * Totals so staff see the backlog and dead letters in the admin response.
 * shortcut: counts by reading ids; fine for a small outbox, use COUNT(*) if it grows.
 */
async function safeTotals(): Promise<{ pending: number; deadLetter: number } | null> {
  try {
    return await outboxTotals(getDb() as unknown as Db);
  } catch {
    return null; // DB not bound or table missing: the disabled answer still works
  }
}

async function outboxTotals(db: Db): Promise<{ pending: number; deadLetter: number }> {
  const count = async (status: string) =>
    (await db.select({ id: outboxEvents.id }).from(outboxEvents).where(eq(outboxEvents.status, status))).length;
  return { pending: await count("pending"), deadLetter: await count("dead_letter") };
}

export type NotificationMessage = { id: string; type: string; text: string };

const NOTE_BY_TYPE: Record<string, string> = {
  "lead.created": "New enquiry. Staff can view it in the admin leads list.",
  "privacy_request.created": "New privacy request. Staff can view it in the admin privacy-requests list.",
};

/**
 * The ONLY data sent to the notification channel (OD-05 A): the public
 * reference, the event type and a fixed note. Never the enquiry text, name,
 * email, phone or any other payload field. shortcut: no link yet, because the
 * admin API needs a header; add one when the Lead Inbox page exists.
 */
export function notificationMessage(event: { eventType: string; aggregateRef: string | null }): NotificationMessage {
  const id = event.aggregateRef ?? "unknown";
  const note = NOTE_BY_TYPE[event.eventType] ?? "New event.";
  return { id, type: event.eventType, text: `${note} Reference: ${id}` };
}
