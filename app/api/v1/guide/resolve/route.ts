// POST /api/v1/guide/resolve (handoff A02) — local wayfinding, not live AI.
//
// Wraps the existing keyword matcher (lib/guide-intent.ts) in the v1 envelope.
// It resolves the destination URL SERVER-SIDE from the product registry (never
// from model text), records an anonymous guide signal (resolved intent only —
// never the raw message), and clearly labels itself mode:"local". No side
// effect beyond the analytics signal; it returns a suggestion, not an action.

import { z } from "zod";
import { getDb } from "@/db";
import { guideSignals } from "@/db/schema";
import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { resolveGuideIntent, type GuideIntent } from "@/lib/guide-intent";
import { products } from "@/data/products";

export const dynamic = "force-dynamic";

const resolveSchema = z
  .object({
    goal: z.string().trim().min(1, "goal is required").max(500),
    locale: z.enum(["en", "ar"]).default("en").catch("en"),
  })
  .strict();

type Suggestion = {
  productId: string;
  label: string;
  destination: string;
};

function suggestionFor(intent: GuideIntent, locale: "en" | "ar"): Suggestion | null {
  const product = products.find((p) => p.id === intent);
  if (!product) return null;
  return {
    productId: product.id,
    label: locale === "ar" ? product.arabicCta : product.cta,
    destination: product.domain,
  };
}

const CLARIFY_QUESTION = {
  en: "Would you like to start with learning, career preparation, or independent work?",
  ar: "هل تفضّل أن تبدأ بالتعلّم، أو الاستعداد المهني، أو العمل المستقل؟",
} as const;

export async function POST(request: Request) {
  const requestId = newRequestId();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
  }

  const parsed = resolveSchema.safeParse(raw);
  if (!parsed.success) {
    return fail({
      code: "validation_failed",
      message: "Provide a non-empty `goal` (max 500 chars) and optional `locale`.",
      requestId,
    });
  }

  const { goal, locale } = parsed.data;
  const intent = resolveGuideIntent(goal);

  // Record the resolved intent only — never the raw goal text.
  try {
    const db = getDb();
    await db.insert(guideSignals).values({ intent, locale, accepted: false });
  } catch {
    // Analytics must never block the user's answer; swallow storage errors.
  }

  // Build a truthful response. Only a resolvable product yields a CTA.
  if (intent === "clarify" || intent === "unknown") {
    return ok(
      {
        mode: "local",
        status: intent === "clarify" ? "needs_clarification" : "unknown",
        question: intent === "clarify" ? CLARIFY_QUESTION[locale] : null,
        suggestion: null,
        note:
          locale === "ar"
            ? "دليل محلي لاختيار المنصة؛ ليس محادثة ذكاء اصطناعي مباشرة."
            : "Local platform-selection guide; not a live AI conversation.",
      },
      { requestId },
    );
  }

  const suggestion = suggestionFor(intent, locale);
  if (!suggestion) {
    // Resolved to a product that is not configured — do not fabricate a CTA.
    return ok(
      { mode: "local", status: "unknown", question: null, suggestion: null },
      { requestId },
    );
  }

  return ok(
    {
      mode: "local",
      status: "resolved",
      intent,
      suggestion,
      note:
        locale === "ar"
          ? "دليل محلي لاختيار المنصة؛ ليس محادثة ذكاء اصطناعي مباشرة."
          : "Local platform-selection guide; not a live AI conversation.",
    },
    { requestId },
  );
}
