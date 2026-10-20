"use client";

// Renders the central Legal Center index and individual policy pages inside the
// existing USAM site shell. Reads the built-in baseline policies from
// lib/legal/policies (pure data, safe on the client). Published admin overrides
// are served by the API/server and merged in when present; otherwise the
// baseline content is shown. The pages render the policy content itself, with
// no draft/review status framing.
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
import { products, trustedDomain } from "@/data/products";
import { parseInlineLinks } from "@/lib/legal/inline-links";
import { CookieSettingsPanel, openCookieSettings } from "./cookie-consent";
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
    frameworks: "Applicable data-protection frameworks",
    backToCenter: "Back to the Legal Center",
    openSettings: "Open Cookie Settings",
    related: "Related policies",
    // Contextual actions per page.
    actionPrivacyReq: "Make a privacy request",
    actionContact: "Contact USAM",
    actionCookies: "Open Cookie Settings",
    actionPlatforms: "See the platform directory",
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
    frameworks: "أطر حماية البيانات المنطبقة",
    backToCenter: "العودة إلى المركز القانوني",
    openSettings: "فتح إعدادات ملفات الارتباط",
    related: "سياسات ذات صلة",
    actionPrivacyReq: "تقديم طلب خصوصية",
    actionContact: "تواصل مع يوزم",
    actionCookies: "فتح إعدادات ملفات الارتباط",
    actionPlatforms: "عرض دليل المنصات",
  },
} as const;

/** Short related-policy set per page (keeps users moving between policies). */
const RELATED: Record<PolicyType, PolicyType[]> = {
  privacy: ["cookies", "ai-use", "privacy-requests"],
  terms: ["privacy", "refunds", "payments"],
  cookies: ["privacy", "ai-use"],
  refunds: ["payments", "terms"],
  payments: ["refunds", "terms"],
  "ai-use": ["privacy", "terms"],
  "privacy-requests": ["privacy", "cookies"],
};

type LocalPolicy = ReturnType<typeof localizedPolicy>;

/** Strip an internal review marker from a public string (mirror of the server). */
function stripMarkers(text: string): string {
  if (/^\s*\[(FOR REVIEW|للمراجعة)[^\]]*\]\s*$/u.test(text)) return "";
  const neutral = /[\u0600-\u06FF]/.test(text) ? "(قيد الإعداد)" : "(being finalized)";
  return text.replace(/\[(FOR REVIEW|للمراجعة)[^\]]*\]/gu, neutral).replace(/\s{2,}/g, " ").trim();
}

/**
 * Render a policy paragraph, turning any safe `[[label|target]]` reference
 * tokens into real in-text links (to another policy/section) via React
 * elements — never raw HTML. Plain text passes straight through.
 */
function Paragraph({ text }: { text: string }) {
  const tokens = parseInlineLinks(text);
  if (tokens.length === 1 && tokens[0].kind === "text") {
    return <p>{tokens[0].text}</p>;
  }
  return (
    <p>
      {tokens.map((tok, i) =>
        tok.kind === "link" ? (
          <Link key={i} href={tok.href}>{tok.label}</Link>
        ) : (
          <span key={i}>{tok.text}</span>
        ),
      )}
    </p>
  );
}

type ShownSection = { id: string; heading: string; body: string[] };
type PublicDoc = Omit<LocalPolicy, "approval" | "sections"> & {
  published: boolean;
  sections: ShownSection[];
};

/**
 * Normalize a policy for public display. The baseline content is finished,
 * user-facing text with no internal markers, so this simply shows every
 * section as-is. `stripMarkers` is kept as a defensive backstop (it should find
 * nothing) so a stray internal token can never reach the page even if one is
 * ever reintroduced. The internal `approval` lifecycle string is dropped and
 * replaced with a plain `published` boolean so it never reaches public output;
 * no draft/"being finalized" treatment is applied.
 */
function redactForPublic(doc: LocalPolicy): PublicDoc {
  const { approval, sections: rawSections, ...rest } = doc;
  const sections: ShownSection[] = rawSections
    .map((s) => ({
      id: s.id,
      heading: s.heading,
      body: s.body.map(stripMarkers).filter((p) => p.trim().length > 0),
    }))
    .filter((s) => s.body.length > 0);
  return {
    ...rest,
    published: approval === "published",
    scope: stripMarkers(doc.scope),
    appliesTo: stripMarkers(doc.appliesTo),
    sections,
  };
}

/** The Legal Center index: cards linking to every policy. */
export function LegalCenter({ locale }: { locale: Locale }) {
  const t = ui[locale];
  // Published state per policy type, fetched from the authoritative API so a
  // card only shows a version string once that policy is actually published.
  // Defaults to "not published" (safe) until the fetch returns.
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
        const isPub = d?.published === true;
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
      </section>
    </div>
  );
}

/** A single policy page with a table of contents and anchored sections. */
export function LegalPolicy({ type, locale }: { type: PolicyType; locale: Locale }) {
  const t = ui[locale];
  const base = getPolicy(type);
  // Baseline localized document (null only for an unknown type). The baseline is
  // finished, user-facing content, so it is rendered directly. If a published
  // admin override exists, the API returns it and we merge it in below. Either
  // way the page shows the policy itself — no draft/review framing.
  const baseline = base ? redactForPublic(localizedPolicy(base, locale)) : null;

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
          published: typeof d.published === "boolean" ? d.published : baseline.published,
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
  const isPublished = doc.published;

  return (
    <article className="legal-doc" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="legal-doc-head">
        {/* Plain-language summary (the policy's scope sentence). */}
        <p className="legal-summary">{doc.scope}</p>
        <dl className="legal-meta">
          <div>
            <dt>{t.appliesTo}</dt>
            <dd>{doc.appliesTo}</dd>
          </div>
          {isPublished && doc.version && (
            <div>
              <dt>{t.version}</dt>
              <dd><bdi>{doc.version}</bdi></dd>
            </div>
          )}
          {isPublished && doc.effectiveAt && (
            <div>
              <dt>{t.effective}</dt>
              <dd><bdi>{doc.effectiveAt}</bdi></dd>
            </div>
          )}
          <div>
            <dt>{t.updated}</dt>
            <dd><bdi>{doc.updatedAt}</bdi></dd>
          </div>
        </dl>
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
              <Paragraph key={i} text={para} />
            ))}
          </section>
        ))}
      </div>

      {/* Functional tools stay available regardless of policy approval state —
          they are controls, not policy wording. The Cookie Policy embeds live
          Cookie Settings; the Privacy Requests page embeds the request form. */}
      {type === "cookies" && <CookieSettingsPanel locale={locale} />}
      {type === "privacy-requests" && <PrivacyRequestForm locale={locale} />}
      {type === "payments" && <PlatformDirectory locale={locale} />}

      {/* A clear contextual action for the page. */}
      <PolicyAction type={type} t={t} />

      {/* Related policies keep users moving between documents. */}
      <nav className="legal-related" aria-label={t.related}>
        <span>{t.related}</span>
        <div>
          {(RELATED[type] ?? []).map((rt) => (
            <Link key={rt} href={POLICIES[rt].path}>{localizedPolicy(POLICIES[rt], locale).title}</Link>
          ))}
        </div>
      </nav>

      <p className="legal-back">
        <Link href="/legal">← {t.backToCenter}</Link>
      </p>
    </article>
  );
}

/**
 * Per-platform VERIFIED deep links. Each entry here was confirmed to resolve to
 * a real, distinct page (HTTP 200 with its own content, not a SPA catch-all
 * shell and not a 404) at build time — see docs/PLATFORM-LEGAL-LINKS.md for the
 * probe evidence and date. We only list a sub-path we actually verified; we do
 * NOT guess refund/privacy paths. For platforms whose sites are client-rendered
 * single-page apps, the server returns the same shell for every path, so we
 * cannot discover or verify their policy/support URLs from here — this is "not
 * yet discovered/verified" (those pages likely exist inside the app), NOT
 * "unavailable". For them we link the home only until their rendered navigation
 * is inspected in a browser.
 */
const PLATFORM_VERIFIED_LINKS: Partial<
  Record<ProductId, Array<{ path: string; en: string; ar: string }>>
> = {
  freelancing: [
    { path: "/support", en: "Support", ar: "الدعم" },
    { path: "/contact", en: "Contact", ar: "التواصل" },
  ],
};

/**
 * Platform directory. The primary link for every platform is its HOME (verified
 * to resolve, HTTP 200), labelled "Open platform" — NOT described as a verified
 * refund/support destination. Where we independently verified a platform's own
 * support/contact page resolves to real content, we add it as a labelled deep
 * link. `trustedDomain` keeps every href on an allowlisted hostname.
 */
function PlatformDirectory({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  return (
    <section className="platform-directory" id="platform-directory" aria-labelledby="platform-directory-h">
      <h2 id="platform-directory-h">{ar ? "دليل المنصات" : "Platform directory"}</h2>
      <p>
        {ar
          ? "تتم المشتريات والاسترداد والدعم على المنصة نفسها. افتح المنصة التي اشتريت منها وابحث عن سياسة الاسترداد وقناة الدعم هناك."
          : "Purchases, refunds and support happen on the platform itself. Open the platform you bought from and look for its refund policy and support channel there."}
      </p>
      <div className="platform-directory-grid">
        {products.map((p) => {
          const verified = PLATFORM_VERIFIED_LINKS[p.id] ?? [];
          const host = new URL(p.domain).hostname;
          return (
            <div key={p.id} className="platform-directory-card">
              <strong>{ar ? p.arabicName : p.name}</strong>
              <span>{host}</span>
              <a className="platform-directory-open" href={trustedDomain(p.domain)} target="_blank" rel="noreferrer">
                {ar ? "افتح المنصة ↗" : "Open platform ↗"}
              </a>
              {verified.length > 0 && (
                <span className="platform-directory-links">
                  {verified.map((v) => (
                    <a
                      key={v.path}
                      href={trustedDomain(p.domain + v.path)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {ar ? v.ar : v.en} ↗
                    </a>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="platform-directory-note">
        {ar
          ? "نُدرج رابطًا مباشرًا (مثل الدعم أو الاسترداد) فقط بعد التحقق من وجود تلك الصفحة فعليًا. وبعض المنصات تعرض صفحاتها داخل التطبيق بعد فتحه، فلم نتمكّن بعد من تحديد روابطها المباشرة والتحقق منها — افتح المنصة وابحث فيها عن سياسة الاسترداد وقناة الدعم. ولأي مساعدة، تواصل مع يوزم عبر صفحة التواصل."
          : "We add a direct link (such as Support or Refunds) only after verifying that page exists. Some platforms render their pages inside the app after it opens, so we have not yet discovered and verified their direct links — open the platform and look for its refund policy and support channel there. For help, contact USAM via the Contact page."}
      </p>
    </section>
  );
}

/** The primary contextual action shown near the foot of each policy page. */
function PolicyAction({ type, t }: { type: PolicyType; t: (typeof ui)[Locale] }) {
  if (type === "privacy-requests") {
    return (
      <p className="legal-action">
        <a className="primary-button" href="#privacy-request-form">{t.actionPrivacyReq}</a>
      </p>
    );
  }
  if (type === "cookies") {
    return (
      <p className="legal-action">
        <button type="button" className="primary-button" onClick={() => openCookieSettings()}>{t.actionCookies}</button>
      </p>
    );
  }
  if (type === "refunds" || type === "payments") {
    return (
      <p className="legal-action">
        <Link className="primary-button" href="/payments#platform-directory">{t.actionPlatforms}</Link>
      </p>
    );
  }
  // privacy / terms / ai-use → a route to raise a question.
  return (
    <p className="legal-action">
      <Link className="primary-button" href="/privacy-requests">{t.actionPrivacyReq}</Link>
      <Link className="quiet-button" href="/contact">{t.actionContact}</Link>
    </p>
  );
}
