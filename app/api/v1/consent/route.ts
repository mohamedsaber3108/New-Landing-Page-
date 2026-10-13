// POST /api/v1/consent — record a standalone consent event (cookie choice,
// marketing withdrawal, etc.) as auditable evidence. Form-tied acceptances are
// recorded atomically inside the leads flow; this endpoint covers consent given
// outside a lead, chiefly the cookie banner / settings.
//
// Minimal personal data: the actor is the signed-in user id or "anonymous".

import { z } from "zod";
import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { recordConsentEvent } from "@/lib/api/consent";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CONSENT_EVENT_TYPES } from "@/db/schema";

export const dynamic = "force-dynamic";

const schema = z.object({
  eventType: z.enum(CONSENT_EVENT_TYPES),
  purpose: z.string().trim().min(1).max(80),
  status: z.enum(["granted", "denied", "withdrawn"]).default("granted"),
  policyType: z.string().trim().max(40).nullish(),
  policyVersion: z.string().trim().max(60).nullish(),
  locale: z.enum(["en", "ar"]).default("en").catch("en"),
  method: z.string().trim().max(60).nullish(),
  // Reference-only cookie category decisions; bounded, no PII.
  detail: z.record(z.string(), z.boolean()).nullish(),
});

export async function POST(request: Request) {
  const requestId = newRequestId();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return fail({ code: "validation_failed", message: "Invalid consent event.", requestId });
  }

  const user = await getChatGPTUser().catch(() => null);
  const stored = await recordConsentEvent({
    eventType: parsed.data.eventType,
    purpose: parsed.data.purpose,
    status: parsed.data.status,
    policyType: parsed.data.policyType ?? null,
    policyVersion: parsed.data.policyVersion ?? null,
    locale: parsed.data.locale,
    method: parsed.data.method ?? "api",
    actor: user?.userId ?? "anonymous",
    detail: parsed.data.detail ?? null,
  });

  // Honest result: if storage is unavailable we say so rather than claim it was
  // recorded. The client treats the user's choice as applied locally regardless.
  return ok({ recorded: stored }, { requestId });
}
