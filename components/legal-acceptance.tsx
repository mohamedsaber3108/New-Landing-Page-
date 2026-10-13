"use client";

// Shared acceptance UI for the enquiry forms (instruction §1/§3/§7).
//
// Behavior is driven by whether the policies are ACTUALLY published:
//  - Terms PUBLISHED  → render a required, unchecked "I agree to the Terms"
//    checkbox (contractual acceptance against the approved version).
//  - Terms DRAFT      → render NO acceptance gate. Instead show a privacy
//    NOTICE line linking to the policies. Submission stays usable; the server
//    records only that the notice was presented, not consent.
//
// The marketing checkbox is always a separate, unchecked, optional opt-in.
//
// The published state comes from GET /api/v1/legal/requirements. The server
// independently enforces the same rule in createLead, so this is UX only.

import { useEffect, useState } from "react";

type Locale = "en" | "ar";

export type LegalRequirements = {
  terms: { published: boolean; version: string | null };
  privacy: { published: boolean; version: string | null };
};

const DEFAULT_REQ: LegalRequirements = {
  terms: { published: false, version: null },
  privacy: { published: false, version: null },
};

/** Fetch which policies are published. Defaults to "draft" (safe) on failure. */
export function useLegalRequirements(): LegalRequirements {
  const [req, setReq] = useState<LegalRequirements>(DEFAULT_REQ);
  useEffect(() => {
    let active = true;
    fetch("/api/v1/legal/requirements")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.data) setReq(json.data as LegalRequirements);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return req;
}

const t = {
  en: {
    terms: "I agree to the",
    termsLink: "Terms of Service",
    termsMid: "and acknowledge the",
    privacyLink: "Privacy Notice",
    after: ".",
    noticePre: "By submitting, you confirm you have read our",
    noticeMid: "and",
    draftTerms: "Terms (in draft)",
    marketing: "I would like to receive offers and product updates.",
  },
  ar: {
    terms: "أوافق على",
    termsLink: "شروط الخدمة",
    termsMid: "وأقر بـ",
    privacyLink: "إشعار الخصوصية",
    after: ".",
    noticePre: "بإرسالك هذا الطلب، تؤكد أنك اطّلعت على",
    noticeMid: "و",
    draftTerms: "الشروط (مسودة)",
    marketing: "أرغب في تلقي العروض ومستجدات المنتجات.",
  },
} as const;

/**
 * Renders the acceptance block. Pass the current requirements. When Terms are
 * published, a required checkbox named `terms` is rendered; otherwise a notice
 * line is shown and no `terms` input exists (so the browser does not block
 * submission on an unpublished policy).
 */
export function AcceptanceFields({
  locale,
  requirements,
}: {
  locale: Locale;
  requirements: LegalRequirements;
}) {
  const L = t[locale];
  const termsPublished = requirements.terms.published;

  return (
    <>
      {termsPublished ? (
        <label className="lead-checkbox">
          <input name="terms" type="checkbox" required />
          <span>
            {L.terms} <a href="/terms" target="_blank" rel="noreferrer">{L.termsLink}</a> {L.termsMid}{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">{L.privacyLink}</a>
            {L.after}
          </span>
        </label>
      ) : (
        <p className="lead-notice" role="note">
          {L.noticePre} <a href="/privacy" target="_blank" rel="noreferrer">{L.privacyLink}</a> {L.noticeMid}{" "}
          <a href="/terms" target="_blank" rel="noreferrer">{L.draftTerms}</a>
          {L.after}
        </p>
      )}
      <label className="lead-checkbox">
        <input name="marketingOptIn" type="checkbox" />
        <span>{L.marketing}</span>
      </label>
    </>
  );
}
