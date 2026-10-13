// Staff policy management (ref 02 §6/§27). Gated by USAM_ADMIN_TOKEN.
//   GET  ?type=<policyType>   -> if type given, version history for that policy;
//                                otherwise an overview of all policies.
//   POST { policyType, locale, version, effectiveAt?, materialChange?, content? }
//                             -> publish a reviewed version (previous kept).
//
// Publishing never overwrites a live policy file in place: prior versions are
// retained in policy_publications and the public pages/API resolve the current
// published version, falling back to the built-in draft baseline.

import { fail, newRequestId, ok } from "@/lib/api/envelope";
import { authorizeAdmin } from "@/lib/api/admin-auth";
import { z } from "zod";
import { listPolicyHistory, listPolicyOverview, publishPolicy, resolvePolicy } from "@/lib/legal/store";
import { POLICY_TYPES, type Locale, type PolicyType } from "@/lib/legal/policies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const denied = authorizeAdmin(request, requestId);
  if (denied) return denied;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const preview = url.searchParams.get("preview");

  if (type) {
    if (!(POLICY_TYPES as string[]).includes(type)) {
      return fail({ code: "not_found", message: `Unknown policy type "${type}".`, requestId });
    }
    // Protected draft preview: staff can view the full (possibly draft) policy
    // text per locale with preview:true, so unpublished wording is reviewable
    // here WITHOUT being presented publicly as a final policy.
    if (preview) {
      const locale: Locale = url.searchParams.get("locale") === "ar" ? "ar" : "en";
      const doc = await resolvePolicy(type as PolicyType, locale, { preview: true });
      return ok({ preview: true, policy: doc }, { requestId });
    }
    const history = await listPolicyHistory(type as PolicyType);
    return ok({ policyType: type, history }, { requestId });
  }
  const overview = await listPolicyOverview();
  return ok({ policies: overview }, { requestId });
}

const publishSchema = z.object({
  policyType: z.enum(POLICY_TYPES as [string, ...string[]]),
  locale: z.enum(["en", "ar"]),
  version: z.string().trim().min(1).max(60),
  effectiveAt: z.string().trim().max(40).nullish(),
  materialChange: z.boolean().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  publishedBy: z.string().trim().max(120).nullish(),
});

export async function POST(request: Request) {
  const requestId = newRequestId();
  const denied = authorizeAdmin(request, requestId);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail({ code: "bad_request", message: "Request body must be valid JSON.", requestId });
  }
  const parsed = publishSchema.safeParse(raw);
  if (!parsed.success) {
    return fail({ code: "validation_failed", message: "Invalid publish request.", requestId });
  }

  const result = await publishPolicy({
    policyType: parsed.data.policyType as PolicyType,
    locale: parsed.data.locale,
    version: parsed.data.version,
    effectiveAt: parsed.data.effectiveAt ?? null,
    materialChange: parsed.data.materialChange,
    content: parsed.data.content as never,
    publishedBy: parsed.data.publishedBy ?? null,
  });
  if (!result.ok) {
    return fail({ code: "internal_error", message: result.message, requestId });
  }
  return ok({ published: true, version: result.version }, { status: 201, requestId });
}
