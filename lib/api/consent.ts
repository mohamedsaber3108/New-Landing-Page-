// Consent / acceptance evidence recording (Legal Implementation Pack §7, ref 02 §5).
//
// Records distinct consent/acceptance EVENTS — terms acceptance, privacy-notice
// acknowledgement, marketing consent, and cookie choices are never collapsed
// into one "accepted = true". Each event carries its policy version, purpose,
// platform, actor, locale and timestamp so the system can answer what/which
// version/why/who/when/how.
//
// Writes are best-effort relative to the primary action they accompany: failing
// to record a consent event must never discard a lead or block a user. The
// caller decides whether to await it.

import { getDb } from "@/db";
import { consentEvents, type NewConsentEvent } from "@/db/schema";
import type { Db } from "./idempotency";

export type ConsentEventType =
  | "terms_acceptance"
  | "privacy_acknowledgement"
  | "privacy_notice_presented"
  | "marketing_consent"
  | "cookie_choice";

export type ConsentStatus = "granted" | "denied" | "withdrawn";

export type RecordConsentInput = {
  eventType: ConsentEventType;
  purpose: string;
  status?: ConsentStatus;
  policyVersion?: string | null;
  policyType?: string | null;
  platform?: string;
  actor?: string;
  subjectRef?: string | null;
  method?: string | null;
  locale?: string;
  detail?: Record<string, unknown> | null;
};

/**
 * Record one consent event. Returns true on success, false if the write failed
 * (e.g. table not migrated yet) — the caller treats false as "evidence not
 * stored" without failing the surrounding operation.
 */
export async function recordConsentEvent(input: RecordConsentInput): Promise<boolean> {
  try {
    const db = getDb() as unknown as Db;
    await db.insert(consentEvents).values(toRow(input));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record several consent events in one atomic batch (D1 batch — see leads.ts for
 * why db.transaction() is not used). Used when a single form submission produces
 * multiple distinct events (terms + privacy + marketing). Returns true on
 * success. The caller may also pass these statements into an existing batch via
 * `consentInsertStatements` to keep them in the SAME transaction as the lead.
 */
export async function recordConsentEvents(inputs: RecordConsentInput[]): Promise<boolean> {
  if (inputs.length === 0) return true;
  try {
    const db = getDb() as unknown as Db;
    const stmts = inputs.map((i) => db.insert(consentEvents).values(toRow(i)));
    // db.batch requires a non-empty tuple; we guarded length above.
    await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build consent-event INSERT statements against a provided db handle, to be
 * appended to another db.batch([...]) so they commit in the SAME transaction as
 * the business write (e.g. the lead). This is how form acceptances become
 * durable evidence atomically with the enquiry.
 */
export function consentInsertStatements(db: Db, inputs: RecordConsentInput[]) {
  return inputs.map((i) => db.insert(consentEvents).values(toRow(i)));
}

function toRow(input: RecordConsentInput): NewConsentEvent {
  return {
    eventType: input.eventType,
    purpose: input.purpose,
    status: input.status ?? "granted",
    policyVersion: input.policyVersion ?? null,
    policyType: input.policyType ?? null,
    platform: input.platform ?? "master",
    actor: input.actor ?? "anonymous",
    subjectRef: input.subjectRef ?? null,
    method: input.method ?? null,
    locale: input.locale ?? "en",
    detail: input.detail ? JSON.stringify(input.detail) : null,
  };
}
