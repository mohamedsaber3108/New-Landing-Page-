// Staff consent-evidence view (ref 02 §5/§27). Gated by USAM_ADMIN_TOKEN.
//   GET            -> aggregate counts by event type + status, and by policy
//                     version, so staff can see coverage and withdrawals.
//   GET ?ref=<r>   -> the consent events tied to a specific enquiry reference,
//                     so a submission's evidence can be inspected beside it.
//
// Returns minimal data: counts and (for a reference) the event rows, which hold
// an actor key rather than profile data.

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { authorizeAdmin } from "@/lib/api/admin-auth";
import { getDb } from "@/db";
import { consentEvents } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const denied = authorizeAdmin(request, requestId);
  if (denied) return denied;

  const ref = new URL(request.url).searchParams.get("ref");

  let db: Db;
  try {
    db = getDb() as unknown as Db;
  } catch {
    return fail({
      code: "dependency_unavailable",
      message: "Database binding `DB` is not configured.",
      requestId,
    });
  }

  try {
    if (ref) {
      const rows = await db
        .select()
        .from(consentEvents)
        .where(eq(consentEvents.subjectRef, ref))
        .orderBy(desc(consentEvents.id))
        .limit(100);
      return ok({ reference: ref, events: rows }, { requestId });
    }

    const byType = await db
      .select({
        eventType: consentEvents.eventType,
        status: consentEvents.status,
        count: sql<number>`count(*)`,
      })
      .from(consentEvents)
      .groupBy(consentEvents.eventType, consentEvents.status);

    const byVersion = await db
      .select({
        policyType: consentEvents.policyType,
        policyVersion: consentEvents.policyVersion,
        count: sql<number>`count(*)`,
      })
      .from(consentEvents)
      .groupBy(consentEvents.policyType, consentEvents.policyVersion);

    return ok({ byType, byVersion }, { requestId });
  } catch {
    return fail({
      code: "dependency_unavailable",
      message: "Consent evidence store is unavailable. Apply the latest migration to D1.",
      requestId,
    });
  }
}
