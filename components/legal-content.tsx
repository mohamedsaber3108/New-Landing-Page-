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
      "This policy is being finalized and is under legal review. Its text is not published yet, so it is not shown here. Any functional controls on this page remain available.",
    published: "Published",
    reviewNote:
      "Policies marked Draft are being finalized under legal review and are not published yet. Published policies show their version and effective date.",
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
      "هذه السياسة قيد الإعداد وتحت المراجعة القانونية. ولم يُنشر نصها بعد، لذا لا يُعرض هنا. وتبقى أي أدوات وظيفية في هذه الصفحة متاحة.",
    published: "منشور",
    reviewNote:
      "السياسات الموسومة «مسودة» قيد الإعداد تحت المراجعة القانونية ولم تُنشر بعد. أما السياسات المنشورة فتعرض إصدارها وتاريخ سريانها.",
    frameworks: "أطر حماية البيانات المنطبقة",
    backToCenter: "العودة إلى المركز القانوني",
    openSettings: "فتح إعدادات ملفات الارتباط",
    notEffective: "لم يَسرِ بعد",
  },
} as const;

type LocalPolicy = ReturnType<typeof localizedPolicy>;

/**
 * Public redaction mirror of the server's publicPolicyView: for a DRAFT policy,
 * strip all section bodies and the version string and show only a neutral
 * "being finalized" notice. Published policies pass through unchanged. This
 * guarantees the client never renders provisional text or "[REQUIRES ...]"
 * placeholders before/without the API response.
 */
function redactForPublic(doc: LocalPolicy, locale: Locale): LocalPolicy {
  if (doc.approval === "published") return doc;
  const notice =
    locale === "ar"
      ? {
          heading: "قيد الإعداد",
          body: [
            "تُراجَع هذه السياسة قانونيًا وستُنشر قريبًا. ولا يُعرض نصها المبدئي هنا حتى اعتماده.",
            "للأسئلة المتعلقة بالخصوصية أو لممارسة حقوقك، استخدم صفحة «طلبات الخصوصية».",
          ],
        }
      : {
          heading: "Being finalized",
          body: [
            "This policy is under legal review and will be published shortly. Its provisional text is not shown here until it is approved.",
            "For privacy questions or to exercise your rights, use the Privacy Requests page.",
          ],
        };
  return {
    ...doc,
    version: "",
    effectiveAt: null,
    sections: [{ id: "status", heading: notice.heading, body: notice.body }],
  };
}

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
  // Published state per policy type, fetched from the authoritative API so the
  // index badge/version reflect reality and never advertise a draft version
  // string. Defaults to "not published" (safe) until the fetch returns.
  const [published, setPublished] = useState<Record<string, { published: boolean; version: string | null }>>({});
  useEffect(() => {
    let active = true;
    Promise.all(
      LEGAL_CENTER_ORDER.map((type) =>
        fetch(`/api/v1/legal/${type}?locale=${locale}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => [type, json?.data] as const)
          .catch(() => [type, null] as const),
      ),
    ).then((pairs) => {
      if (!active) return;
      const map: Record<string, { published: boolean; version: string | null }> = {};
      for (const [type, d] of pairs) {
        const isPub = d?.approval === "published";
        map[type] = { published: isPub, version: isPub ? d?.version ?? null : null };
      }
      setPublished(map);
    });
    return () => {
      active = false;
    };
  }, [locale]);

  return (
    <div className="legal-center">
      <p className="legal-lead">{t.centerIntro}</p>
      <div className="legal-grid">
        {LEGAL_CENTER_ORDER.map((type) => {
          const p = localizedPolicy(POLICIES[type], locale);
          const state = published[type];
          const isPub = state?.published ?? false;
          return (
            <Link key={type} href={p.path} className="legal-card">
              <span className="legal-card-top">
                <b>{p.title}</b>
                <Badge published={isPub} locale={locale} />
              </span>
              <span className="legal-card-scope">{p.scope}</span>
              {isPub && state?.version && (
                <span className="legal-card-meta">
                  {t.version}: <bdi>{state.version}</bdi>
                </span>
              )}
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
  // Baseline localized document (null only for an unknown type). The built-in
  // baseline is a DRAFT, so we must NOT render its section bodies or any
  // "[REQUIRES ...]" placeholders publicly. Until the authoritative API view
  // arrives, show only safe metadata + a neutral "being finalized" notice. The
  // API (publicPolicyView) returns full text ONLY for a published release.
  const baseline = base ? redactForPublic(localizedPolicy(base, locale), locale) : null;

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
            <dd><bdi>{doc.version || "—"}</bdi></dd>
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
          </section>
        ))}
      </div>

      {/* Functional tools stay available regardless of policy approval state —
          they are controls, not policy wording. The Cookie Policy embeds live
          Cookie Settings; the Privacy Requests page embeds the request form. */}
      {type === "cookies" && <CookieSettingsPanel locale={locale} />}
      {type === "privacy-requests" && <PrivacyRequestForm locale={locale} />}

      <p className="legal-back">
        <Link href="/legal">← {t.backToCenter}</Link>
      </p>
    </article>
  );
}
