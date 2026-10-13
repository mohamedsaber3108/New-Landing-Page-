"use client";

// Renders the central Legal Center index and individual policy pages inside the
// existing USAM site shell. Reads the built-in baseline policies from
// lib/legal/policies (pure data, safe on the client). Published admin overrides
// are served by the API/server; these pages render the reviewed baseline text
// with an honest draft/published badge so nothing provisional is passed off as
// final.
//
// Bilingual (EN/AR) with RTL via logical CSS, anchor links per section,
// heading structure, mobile-friendly, and theme-aware through CSS tokens.

import Link from "./nav-link";
import { useEffect, useState } from "react";
import {
  LEGAL_CENTER_ORDER,
  LEGAL_FRAMEWORKS,
  POLICIES,
  getPolicy,
  localizedPolicy,
  type Locale,
  type PolicyType,
} from "@/lib/legal/policies";
import { CookieSettingsPanel } from "./cookie-consent";
import { PrivacyRequestForm } from "./privacy-request-form";

const ui = {
  en: {
    centerIntro:
      "These policies govern the USAM Master website (usamif.com) — a discovery and enquiry portal. Buying, accounts, and payments happen on the platforms, each under its own terms.",
    onThisPage: "On this page",
    scope: "Scope",
    appliesTo: "Applies to",
    version: "Version",
    effective: "Effective",
    updated: "Last updated",
    notPublished:
      "Draft for review — this wording is provisional and awaiting legal review before it becomes a binding notice. It describes how the website actually behaves today.",
    published: "Published",
    reviewNote:
      "Items marked [REQUIRES LEGAL REVIEW] or [REQUIRES CONFIGURATION] are business/legal facts a human must confirm before publication; they are shown rather than invented.",
    frameworks: "Applicable data-protection frameworks",
    backToCenter: "Back to the Legal Center",
    openSettings: "Open Cookie Settings",
    notEffective: "Not yet effective",
  },
  ar: {
    centerIntro:
      "تحكم هذه السياسات موقع يوزم الرئيسي (usamif.com) — بوابة اكتشاف واستفسار. أما الشراء والحسابات والمدفوعات فتتم على المنصات، كلٌّ وفق شروطها.",
    onThisPage: "في هذه الصفحة",
    scope: "النطاق",
    appliesTo: "ينطبق على",
    version: "الإصدار",
    effective: "تاريخ السريان",
    updated: "آخر تحديث",
    notPublished:
      "مسودة للمراجعة — هذه الصياغة مبدئية وبانتظار المراجعة القانونية قبل أن تصبح إشعارًا مُلزِمًا. وهي تصف سلوك الموقع الفعلي اليوم.",
    published: "منشور",
    reviewNote:
      "العناصر الموسومة بـ [يتطلب مراجعة قانونية] أو [يتطلب تهيئة] هي حقائق قانونية/تجارية يجب أن يؤكدها إنسان قبل النشر؛ وتُعرض بدلًا من اختلاقها.",
    frameworks: "أطر حماية البيانات المنطبقة",
    backToCenter: "العودة إلى المركز القانوني",
    openSettings: "فتح إعدادات ملفات الارتباط",
    notEffective: "لم يَسرِ بعد",
  },
} as const;

function Badge({ published, locale }: { published: boolean; locale: Locale }) {
  const t = ui[locale];
  return (
    <span className={published ? "legal-badge legal-badge-ok" : "legal-badge legal-badge-draft"}>
      {published ? t.published : locale === "ar" ? "مسودة" : "Draft"}
    </span>
  );
}

/** The Legal Center index: cards linking to every policy. */
export function LegalCenter({ locale }: { locale: Locale }) {
  const t = ui[locale];
  return (
    <div className="legal-center">
      <p className="legal-lead">{t.centerIntro}</p>
      <div className="legal-grid">
        {LEGAL_CENTER_ORDER.map((type) => {
          const p = localizedPolicy(POLICIES[type], locale);
          const published = p.approval === "published";
          return (
            <Link key={type} href={p.path} className="legal-card">
              <span className="legal-card-top">
                <b>{p.title}</b>
                <Badge published={published} locale={locale} />
              </span>
              <span className="legal-card-scope">{p.scope}</span>
              <span className="legal-card-meta">
                {t.version}: <bdi>{p.version}</bdi>
              </span>
            </Link>
          );
        })}
      </div>

      <section className="legal-frameworks" aria-labelledby="frameworks-heading">
        <h2 id="frameworks-heading">{t.frameworks}</h2>
        <ul>
          {LEGAL_FRAMEWORKS.map((f) => (
            <li key={f.jurisdiction.en}>
              <strong>{f.jurisdiction[locale]}:</strong> {f.law[locale]} <em>{f.note[locale]}</em>
            </li>
          ))}
        </ul>
        <p className="legal-review-note">{t.reviewNote}</p>
      </section>
    </div>
  );
}

/** A single policy page with a table of contents and anchored sections. */
export function LegalPolicy({ type, locale }: { type: PolicyType; locale: Locale }) {
  const t = ui[locale];
  const base = getPolicy(type);
  // Baseline localized document (null only for an unknown type). Hooks must run
  // unconditionally, so compute a safe fallback and bail in render below.
  const baseline = base ? localizedPolicy(base, locale) : null;

  // Live-resolve a published override from the API when available, so the page
  // reflects an admin-published version without a code change. Falls back to
  // the baseline already rendered (progressive enhancement; no layout shift).
  const [resolved, setResolved] = useState(baseline);
  useEffect(() => {
    if (!baseline) return;
    let active = true;
    fetch(`/api/v1/legal/${type}?locale=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json?.data) return;
        const d = json.data;
        setResolved({
          ...baseline,
          title: d.title ?? baseline.title,
          scope: d.scope ?? baseline.scope,
          appliesTo: d.appliesTo ?? baseline.appliesTo,
          version: d.version ?? baseline.version,
          effectiveAt: d.effectiveAt ?? baseline.effectiveAt,
          approval: d.approval ?? baseline.approval,
          sections: Array.isArray(d.sections)
            ? d.sections.map((s: { id: string; title: string; body: string }) => ({
                id: s.id,
                heading: s.title,
                body: typeof s.body === "string" ? s.body.split("\n\n") : [],
              }))
            : baseline.sections,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, locale]);

  if (!baseline) return null;
  const doc = resolved ?? baseline;
  const isPublished = doc.approval === "published";

  return (
    <article className="legal-doc" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="legal-doc-head">
        <Badge published={isPublished} locale={locale} />
        <dl className="legal-meta">
          <div>
            <dt>{t.scope}</dt>
            <dd>{doc.scope}</dd>
          </div>
          <div>
            <dt>{t.appliesTo}</dt>
            <dd>{doc.appliesTo}</dd>
          </div>
          <div>
            <dt>{t.version}</dt>
            <dd><bdi>{doc.version}</bdi></dd>
          </div>
          <div>
            <dt>{t.effective}</dt>
            <dd>{doc.effectiveAt ?? t.notEffective}</dd>
          </div>
          <div>
            <dt>{t.updated}</dt>
            <dd><bdi>{doc.updatedAt}</bdi></dd>
          </div>
        </dl>
        {!isPublished && (
          <p className="legal-draft-note" role="note">
            {t.notPublished}
          </p>
        )}
      </div>

      <nav className="legal-toc" aria-label={t.onThisPage}>
        <span>{t.onThisPage}</span>
        <ul>
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.heading}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="legal-sections">
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`}>{s.heading}</h2>
            {s.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            {/* The Cookie Policy embeds the live Cookie Settings panel. */}
            {type === "cookies" && s.id === "optional" && <CookieSettingsPanel locale={locale} />}
          </section>
        ))}
      </div>

      {/* The Privacy Requests page embeds the working request form. */}
      {type === "privacy-requests" && <PrivacyRequestForm locale={locale} />}

      <p className="legal-back">
        <Link href="/legal">← {t.backToCenter}</Link>
      </p>
    </article>
  );
}
