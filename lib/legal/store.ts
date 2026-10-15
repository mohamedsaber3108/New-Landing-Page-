// Resolves the policy to serve: a published admin override if one exists,
// otherwise the built-in baseline from lib/legal/policies. This is what public
// pages and the /api/v1/legal endpoint read, so publishing a reviewed version
// in the admin takes effect without a code change — and previous versions are
// retained in policy_publications (never overwritten).

import { getDb } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { policyPublications } from "@/db/schema";
import type { Db } from "@/lib/api/idempotency";
import {
  getPolicy,
  localizedPolicy,
  PENDING_SECTION_NOTE,
  POLICY_TYPES,
  type LocalizedPolicy,
  type Locale,
  type PolicyType,
} from "./policies";

/**
 * Resolve the active localized policy for a type + locale.
 *  1. If a published ("current") override exists in policy_publications, serve
 *     it (approval: "published").
 *  2. Otherwise serve the built-in baseline (approval stays "draft").
 * The DB is optional: if it is unavailable we always fall back to the baseline,
 * so legal pages render even without a database binding.
 */
export async function resolvePolicy(
  type: PolicyType,
  locale: Locale,
  opts: { preview?: boolean } = {},
): Promise<LocalizedPolicy | null> {
  const base = getPolicy(type);
  if (!base) return null;
  const baseline = localizedPolicy(base, locale);

  const row = await currentPublishedRow(type, locale);
  if (!row) return baseline; // not published in this locale → draft baseline

  const content = safeParse(row.content);
  if (!content) return baseline;

  // A policy counts as "published" to the public only when BOTH locales are
  // published at the SAME version — otherwise we render the available text but
  // keep the honest "draft" badge, so a half-published or version-mismatched
  // release is never presented as a complete approved policy. (Preview mode,
  // used only by the protected admin preview, shows the true per-locale state.)
  const req = await getPolicyRequirement(type);
  const consistentlyPublished = req.required && req.version === row.version;
  const approval: LocalizedPolicy["approval"] =
    opts.preview || consistentlyPublished ? "published" : "draft";

  return {
    ...baseline,
    ...content,
    type,
    version: row.version,
    effectiveAt: row.effectiveAt ?? baseline.effectiveAt,
    approval,
  };
}

function safeParse(json: string): Partial<LocalizedPolicy> | null {
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" ? (value as Partial<LocalizedPolicy>) : null;
  } catch {
    return null;
  }
}

/**
 * PUBLIC projection of a policy. The public web + public API must NEVER expose
 * unapproved draft text or internal placeholders (e.g. "[REQUIRES LEGAL
 * REVIEW]"). So:
 *   - PUBLISHED (consistent EN+AR release): return the full approved document.
 *   - DRAFT / inconsistent: return ONLY safe metadata (title, scope, applies-to)
 *     plus a neutral "being finalized" notice — no section bodies, no
 *     placeholders. Full draft text is reachable only via the authenticated
 *     admin preview.
 * Returns null for an unknown type.
 */
export async function publicPolicyView(
  type: PolicyType,
  locale: Locale,
): Promise<LocalizedPolicy | null> {
  const resolved = await resolvePolicy(type, locale);
  if (!resolved) return null;
  if (resolved.approval === "published") return resolved;

  // DRAFT: show the real, readable content rather than blanking the page, while
  // (a) never exposing internal "[FOR REVIEW …]"/"[للمراجعة …]" markers, and
  // (b) not presenting unconfirmed legal COMMITMENTS as final.
  //
  //  - A section flagged `pending` is a commitment awaiting counsel/business
  //    input: we replace its body with a short, user-appropriate note.
  //  - Any other section is informational (describes real behavior): we show it,
  //    but defensively strip any inline [FOR REVIEW …] fragment (and drop a
  //    paragraph that is ONLY such a marker) so a stray token never leaks.
  const pendingNote = locale === "ar" ? PENDING_SECTION_NOTE.ar : PENDING_SECTION_NOTE.en;

  const sections = resolved.sections
    .map((s) => {
      if (s.pending) {
        return { id: s.id, heading: s.heading, body: [pendingNote], pending: true };
      }
      const body = s.body
        .map(stripReviewMarkers)
        .filter((p) => p.trim().length > 0);
      return { id: s.id, heading: s.heading, body, pending: false };
    })
    // Drop any section that ended up with no shown content.
    .filter((s) => s.body.length > 0);

  return {
    type: resolved.type,
    path: resolved.path,
    // Do not advertise a provisional version string publicly.
    version: "",
    effectiveAt: null,
    updatedAt: resolved.updatedAt,
    approval: "draft",
    title: resolved.title,
    scope: stripReviewMarkers(resolved.scope),
    appliesTo: stripReviewMarkers(resolved.appliesTo),
    audience: resolved.audience,
    sections,
  };
}

/**
 * Remove internal review markers from a public string. A paragraph that is
 * ONLY a marker becomes empty (and is filtered out by the caller); a marker
 * embedded in otherwise-real text is replaced with a short, neutral phrase so
 * the surrounding factual content still reads.
 */
function stripReviewMarkers(text: string): string {
  const neutralEn = "(being finalized)";
  const neutralAr = "(قيد الإعداد)";
  // If the whole paragraph is just a marker, blank it.
  if (/^\s*\[(FOR REVIEW|للمراجعة)[^\]]*\]\s*$/u.test(text)) return "";
  // Otherwise replace any embedded marker in place.
  const neutral = /[\u0600-\u06FF]/.test(text) ? neutralAr : neutralEn;
  return text.replace(/\[(FOR REVIEW|للمراجعة)[^\]]*\]/gu, neutral).replace(/\s{2,}/g, " ").trim();
}

/**
 * Fetch the "current" published row for a policy type + locale, or null if the
 * policy is not published in that locale. Unlike resolvePolicy, this does NOT
 * fall back to the draft baseline — callers that need to know "is there an
 * APPROVED version" must distinguish published from draft.
 */
async function currentPublishedRow(
  type: PolicyType,
  locale: Locale,
): Promise<typeof policyPublications.$inferSelect | null> {
  try {
    const db = getDb() as unknown as Db;
    const rows = await db
      .select()
      .from(policyPublications)
      .where(
        and(
          eq(policyPublications.policyType, type),
          eq(policyPublications.locale, locale),
          eq(policyPublications.status, "current"),
        ),
      )
      .orderBy(desc(policyPublications.id))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether a policy has an APPROVED, PUBLISHED release that is consistent across
 * both languages (EN and AR point to the SAME version string). This is the only
 * basis on which the Master may require a user to accept that policy.
 *
 *   { required: false }                      → policy is still draft (or EN/AR
 *                                               releases disagree). Do NOT gate
 *                                               acceptance; present a notice.
 *   { required: true, version, effectiveAt } → safe to require + record
 *                                               acceptance against this version.
 *
 * If EN and AR are published under DIFFERENT versions, we treat the policy as
 * not-consistently-published (required:false) rather than silently binding a
 * user to a mismatched release.
 */
export async function getPolicyRequirement(type: PolicyType): Promise<
  | { required: false; reason: "draft" | "locale_mismatch" }
  | { required: true; version: string; effectiveAt: string | null }
> {
  const [en, ar] = await Promise.all([
    currentPublishedRow(type, "en"),
    currentPublishedRow(type, "ar"),
  ]);
  if (!en || !ar) return { required: false, reason: "draft" };
  if (en.version !== ar.version) return { required: false, reason: "locale_mismatch" };
  return { required: true, version: en.version, effectiveAt: en.effectiveAt ?? null };
}

// ---------------------------------------------------------------------------
// Admin / staff operations (used by the protected admin endpoint).
// ---------------------------------------------------------------------------

/**
 * List, per policy type + locale: the built-in baseline version and the current
 * published override (if any) plus how many prior versions are retained. This
 * is the policy overview the admin shows.
 */
export async function listPolicyOverview(): Promise<
  Array<{
    policyType: PolicyType;
    locale: Locale;
    baselineVersion: string;
    baselineApproval: string;
    publishedVersion: string | null;
    publishedEffectiveAt: string | null;
    versionCount: number;
  }>
> {
  const out: Array<{
    policyType: PolicyType;
    locale: Locale;
    baselineVersion: string;
    baselineApproval: string;
    publishedVersion: string | null;
    publishedEffectiveAt: string | null;
    versionCount: number;
  }> = [];

  let rows: Array<typeof policyPublications.$inferSelect> = [];
  try {
    const db = getDb() as unknown as Db;
    rows = await db.select().from(policyPublications).orderBy(desc(policyPublications.id));
  } catch {
    rows = [];
  }

  const locales: Locale[] = ["en", "ar"];
  for (const type of POLICY_TYPES) {
    const base = getPolicy(type);
    if (!base) continue;
    for (const locale of locales) {
      const forKey = rows.filter((r) => r.policyType === type && r.locale === locale);
      const current = forKey.find((r) => r.status === "current") ?? null;
      out.push({
        policyType: type,
        locale,
        baselineVersion: base.version,
        baselineApproval: base.approval,
        publishedVersion: current?.version ?? null,
        publishedEffectiveAt: current?.effectiveAt ?? null,
        versionCount: forKey.length,
      });
    }
  }
  return out;
}

/** Retained version history for one policy type (both locales). */
export async function listPolicyHistory(type: PolicyType) {
  try {
    const db = getDb() as unknown as Db;
    const rows = await db
      .select({
        id: policyPublications.id,
        locale: policyPublications.locale,
        version: policyPublications.version,
        status: policyPublications.status,
        materialChange: policyPublications.materialChange,
        effectiveAt: policyPublications.effectiveAt,
        publishedBy: policyPublications.publishedBy,
        createdAt: policyPublications.createdAt,
      })
      .from(policyPublications)
      .where(eq(policyPublications.policyType, type))
      .orderBy(desc(policyPublications.id));
    return rows;
  } catch {
    return [];
  }
}

export type PublishPolicyInput = {
  policyType: PolicyType;
  locale: Locale;
  version: string;
  effectiveAt?: string | null;
  materialChange?: boolean;
  // Localized policy content (title/scope/appliesTo/sections). If omitted, the
  // baseline content is published under the new version (common when the only
  // change is approval + effective date).
  content?: Partial<LocalizedPolicy>;
  publishedBy?: string | null;
};

/**
 * Publish a reviewed policy version. Retires any existing "current" row for the
 * same type+locale (kept in history, not deleted) and inserts the new one as
 * "current". Returns the published version.
 */
export async function publishPolicy(input: PublishPolicyInput): Promise<
  { ok: true; version: string } | { ok: false; message: string }
> {
  const base = getPolicy(input.policyType);
  if (!base) return { ok: false, message: `Unknown policy type "${input.policyType}".` };

  const content = {
    ...localizedPolicy(base, input.locale),
    ...(input.content ?? {}),
    type: input.policyType,
    version: input.version,
    effectiveAt: input.effectiveAt ?? new Date().toISOString().slice(0, 10),
    approval: "published" as const,
  };

  try {
    const db = getDb() as unknown as Db;
    // Retire the previous current row (history preserved).
    await db
      .update(policyPublications)
      .set({ status: "retired" })
      .where(
        and(
          eq(policyPublications.policyType, input.policyType),
          eq(policyPublications.locale, input.locale),
          eq(policyPublications.status, "current"),
        ),
      );
    await db.insert(policyPublications).values({
      policyType: input.policyType,
      locale: input.locale,
      version: input.version,
      status: "current",
      materialChange: input.materialChange ?? false,
      effectiveAt: content.effectiveAt,
      content: JSON.stringify(content),
      publishedBy: input.publishedBy ?? null,
    });
    return { ok: true, version: input.version };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "publish failed";
    return { ok: false, message: msg };
  }
}
