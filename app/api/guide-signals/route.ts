// Anonymous guide routing signals for the USAM Master site.
//
//   POST /api/guide-signals -> record a resolved guide intent (no raw message)
//   GET  /api/guide-signals -> aggregated counts per intent (last 30 days)
//
// This preserves the documented product boundary: the guide is not a connected
// AI chatbot and the visitor's message is never stored. Only the resolved
// intent + locale are persisted so the team can understand demand.

import { and, count, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { guideSignals } from "@/db/schema";
import { createGuideSignalSchema, parseBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

function toRouteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("no such table") || combined.includes("guide_signals")) {
    return "The guide_signals table is unavailable. Generate the migration with `npm run db:generate`, then deploy so the platform applies the SQL to the real D1 database.";
  }
  if (combined.includes("`DB` is unavailable")) {
    return "Database binding `DB` is not configured. Set `d1` to `DB` in .openai/hosting.json and rebuild.";
  }
  return message;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseBody(createGuideSignalSchema, raw);
  if (!parsed.success) {
    return Response.json({ errors: parsed.errors }, { status: 400 });
  }

  try {
    const db = getDb();
    await db.insert(guideSignals).values({
      intent: parsed.data.intent,
      locale: parsed.data.locale,
      accepted: parsed.data.accepted,
    });

    // Fire-and-forget analytics: acknowledge without echoing anything back.
    return Response.json({ recorded: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = getDb();

    // Aggregate the last 30 days of signals, grouped by resolved intent.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    const rows = await db
      .select({
        intent: guideSignals.intent,
        total: count(),
        accepted: sql<number>`sum(case when ${guideSignals.accepted} then 1 else 0 end)`,
      })
      .from(guideSignals)
      .where(and(gte(guideSignals.createdAt, since)))
      .groupBy(guideSignals.intent);

    const summary = rows.map((row) => ({
      intent: row.intent,
      total: Number(row.total),
      accepted: Number(row.accepted ?? 0),
    }));

    return Response.json({ since, summary });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
