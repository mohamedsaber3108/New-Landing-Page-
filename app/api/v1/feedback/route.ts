// POST /api/v1/feedback (handoff C07) — content helpfulness signal.
//
// Accepts ONLY a known contentId + a bounded rating (+1/-1) + locale. It
// deliberately rejects any free text so the public endpoint cannot be used to
// harvest personal data (handoff: "no free-text personal data in public
// helpfulness events").

import { z } from "zod";
import { getDb } from "@/db";
import { content_feedback } from "@/db/schema";
import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { knownContentIds } from "@/lib/api/content";

export const dynamic = "force-dynamic";

const feedbackSchema = z
  .object({
    contentId: z.string().trim().min(1).max(80),
    rating: z.union([z.literal(1), z.literal(-1)]),
    locale: z.enum(["en", "ar"]).default("en").catch("en"),
  })
  // Reject any extra keys so a client cannot smuggle a free-text field through.
  .strict();

export async function POST(request: Request) {
  const requestId = newRequestId();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
  }

  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) {
    return fail({
      code: "validation_failed",
      message: "Feedback accepts only contentId, rating (1 or -1), and locale.",
      requestId,
    });
  }

  // contentId must be one we actually publish — prevents arbitrary id spraying.
  if (!knownContentIds().has(parsed.data.contentId)) {
    return fail({ code: "not_found", message: "Unknown contentId.", requestId });
  }

  try {
    const db = getDb();
    await db.insert(content_feedback).values({
      contentId: parsed.data.contentId,
      rating: parsed.data.rating,
      locale: parsed.data.locale,
    });
    return ok({ recorded: true }, { status: 201, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("`DB` is unavailable") || message.includes("no such table")) {
      return fail({
        code: "dependency_unavailable",
        message: "Feedback storage is unavailable. Apply the latest migration to the D1 database.",
        requestId,
      });
    }
    return fail({ code: "internal_error", message: "An unexpected error occurred.", requestId });
  }
}
