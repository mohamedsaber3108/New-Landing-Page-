"use client";

// Structured partnership/proposal enquiry forms for Enterprises and Government.
// Reuses the exact submit/idempotency/success architecture of ContactLeadForm:
//   - one Idempotency-Key per form instance (prevents duplicate submissions)
//   - success shown ONLY after the server returns 201 + a reference
//   - entered data is preserved on recoverable errors (the form is not reset)
//   - submits to POST /api/v1/leads with a validated `structured` block
//
// Two variants differ in their field set and controlled vocabularies; both
// post to the same canonical endpoint. No field is concatenated into message.

import { useRef, useState } from "react";
import {
  BUDGET_RANGES,
  ENTERPRISE_ENQUIRY_TYPES,
  GOVERNMENT_INITIATIVE_TYPES,
  PARTICIPANT_RANGES,
  TIMELINE_OPTIONS,
} from "@/db/schema";
import { AcceptanceFields, useLegalRequirements } from "./legal-acceptance";

type Locale = "en" | "ar";
type Variant = "enterprise" | "government";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; reference: string; notificationStatus: string }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string[]> };

const common = {
  en: {
    name: "Full name",
    email: "Work email",
    role: "Job title / role",
    phone: "Phone (optional)",
    country: "Country",
    timeline: "Expected timeline",
    message: "Description",
    submit: "Submit enquiry",
    submitting: "Submitting…",
    successTitle: "Enquiry received",
    successBody: "Keep this reference for follow-up:",
    notifyPending: "We will route it to the team shortly.",
    notifyUnconfigured: "Notifications are not configured yet, so your enquiry is saved and queued for the team.",
    errorTitle: "We could not submit that",
    required: "Please complete the required fields.",
    offline: "Could not reach the server. Please try again.",
    choose: "Select…",
    optional: "optional",
    timelines: { immediate: "As soon as possible", "1-3-months": "1–3 months", "3-6-months": "3–6 months", "6-12-months": "6–12 months", "not-decided": "Not decided yet" } as Record<string, string>,
    ranges: { "1-10": "1–10", "11-50": "11–50", "51-200": "51–200", "201-1000": "201–1000", "1000+": "1000+" } as Record<string, string>,
    budgets: { "under-10k": "Under 10k", "10k-50k": "10k–50k", "50k-250k": "50k–250k", "250k-plus": "250k+", "prefer-to-discuss": "Prefer to discuss" } as Record<string, string>,
  },
  ar: {
    name: "الاسم الكامل",
    email: "البريد المهني",
    role: "المسمى الوظيفي / الدور",
    phone: "الهاتف (اختياري)",
    country: "الدولة",
    timeline: "الإطار الزمني المتوقع",
    message: "الوصف",
    submit: "إرسال الطلب",
    submitting: "جارٍ الإرسال…",
    successTitle: "تم استلام الطلب",
    successBody: "احتفظ بهذا الرقم المرجعي للمتابعة:",
    notifyPending: "سنوجّهه إلى الفريق قريبًا.",
    notifyUnconfigured: "لم تُفعّل الإشعارات بعد، لذا حُفظ طلبك وأُدرج في قائمة انتظار الفريق.",
    errorTitle: "تعذّر إرسال الطلب",
    required: "يرجى إكمال الحقول المطلوبة.",
    offline: "تعذّر الاتصال. حاول مرة أخرى.",
    choose: "اختر…",
    optional: "اختياري",
    timelines: { immediate: "في أقرب وقت", "1-3-months": "١–٣ أشهر", "3-6-months": "٣–٦ أشهر", "6-12-months": "٦–١٢ شهرًا", "not-decided": "لم يُحدَّد بعد" } as Record<string, string>,
    ranges: { "1-10": "١–١٠", "11-50": "١١–٥٠", "51-200": "٥١–٢٠٠", "201-1000": "٢٠١–١٠٠٠", "1000+": "+١٠٠٠" } as Record<string, string>,
    budgets: { "under-10k": "أقل من ١٠ آلاف", "10k-50k": "١٠–٥٠ ألفًا", "50k-250k": "٥٠–٢٥٠ ألفًا", "250k-plus": "+٢٥٠ ألفًا", "prefer-to-discuss": "أفضّل المناقشة" } as Record<string, string>,
  },
} as const;

const variantCopy = {
  enterprise: {
    en: {
      heading: "Partner with USAM",
      intro: "Tell us about your hiring, workforce, or partnership need. We store your enquiry securely and reply by email.",
      org: "Organization",
      type: "Enquiry type",
      size: "Team / participant size",
      budget: "Budget range",
      types: { hiring: "Hiring & talent", "workforce-development": "Workforce development", "project-expertise": "Project expertise", partnership: "Partnership", other: "Other" } as Record<string, string>,
      marketing: "Send me occasional USAM updates (optional)",
    },
    ar: {
      heading: "اشترك مع يوزم",
      intro: "أخبرنا باحتياجك في التوظيف أو تطوير القوى العاملة أو الشراكة. نحفظ طلبك بأمان ونرد عبر البريد.",
      org: "المؤسسة",
      type: "نوع الطلب",
      size: "حجم الفريق / المشاركين",
      budget: "نطاق الميزانية",
      types: { hiring: "التوظيف والمواهب", "workforce-development": "تطوير القوى العاملة", "project-expertise": "خبرات المشاريع", partnership: "شراكة", other: "أخرى" } as Record<string, string>,
      marketing: "أرسلوا لي تحديثات يوزم أحيانًا (اختياري)",
    },
  },
  government: {
    en: {
      heading: "Government programs & partnerships",
      intro: "Describe your initiative. We store your proposal securely and reply by email.",
      org: "Institution / entity",
      type: "Initiative type",
      size: "Estimated participants",
      beneficiaries: "Intended beneficiaries",
      types: { "learning-program": "Learning program", "talent-development": "Talent development", "youth-program": "Youth program", "innovation-partnership": "Innovation partnership", other: "Other" } as Record<string, string>,
    },
    ar: {
      heading: "برامج وشراكات حكومية",
      intro: "صف مبادرتك. نحفظ مقترحك بأمان ونرد عبر البريد الإلكتروني.",
      org: "الجهة / المؤسسة",
      type: "نوع المبادرة",
      size: "العدد التقديري للمشاركين",
      beneficiaries: "الفئات المستفيدة",
      types: { "learning-program": "برنامج تعليمي", "talent-development": "تطوير المواهب", "youth-program": "برنامج شبابي", "innovation-partnership": "شراكة ابتكار", other: "أخرى" } as Record<string, string>,
    },
  },
} as const;

export function EnquiryForm({ locale, variant }: { locale: Locale; variant: Variant }) {
  const C = common[locale];
  const V = variantCopy[variant][locale];
  const kind = variant === "enterprise" ? "enterprise" : "government";
  const typeOptions = variant === "enterprise" ? ENTERPRISE_ENQUIRY_TYPES : GOVERNMENT_INITIATIVE_TYPES;
  const typeLabels = variantCopy[variant][locale].types;

  const [state, setState] = useState<FormState>({ kind: "idle" });
  const requirements = useLegalRequirements();
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;
    const data = new FormData(event.currentTarget);

    const val = (k: string) => {
      const v = data.get(k);
      const s = typeof v === "string" ? v.trim() : "";
      return s === "" ? undefined : s;
    };

    const accepted = data.get("terms") === "on";
    const structured: Record<string, unknown> = {
      role: val("role"),
      phone: val("phone"),
      country: val("country"),
      enquiryType: val("enquiryType"),
      participantRange: val("participantRange"),
      timeline: val("timeline"),
      // Accurate acceptance signals. The server derives the real requirement
      // from the published policy state and records evidence against its own
      // version; it does not trust a client version string. When Terms are
      // draft there is no `terms` checkbox and the server records notice
      // presentation only — submission stays usable.
      termsPresented: requirements.terms.published,
      termsAccepted: accepted,
      privacyAcknowledged: requirements.privacy.published && accepted,
    };
    if (variant === "enterprise") structured.budgetRange = val("budgetRange");
    if (variant === "government") structured.beneficiaries = val("beneficiaries");

    const payload = {
      name: val("name") ?? "",
      email: val("email") ?? "",
      organization: val("organization"),
      kind,
      locale,
      message: val("message") ?? "",
      marketingOptIn: data.get("marketingOptIn") === "on",
      structured,
    };

    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => null)) as
        | { data?: { reference: string; notificationStatus: string }; error?: { message: string; fieldErrors?: Record<string, string[]> } }
        | null;

      if (response.ok && json?.data?.reference) {
        setState({ kind: "success", reference: json.data.reference, notificationStatus: json.data.notificationStatus });
        return;
      }
      // Error: keep the entered data (form is not reset) so the user can retry.
      setState({ kind: "error", message: json?.error?.message ?? C.required, fieldErrors: json?.error?.fieldErrors });
    } catch {
      setState({ kind: "error", message: C.offline });
    }
  }

  if (state.kind === "success") {
    return (
      <section className="lead-form lead-form-success" role="status" aria-live="polite">
        <h2>{C.successTitle}</h2>
        <p>{C.successBody}</p>
        <p className="lead-reference"><bdi>{state.reference}</bdi></p>
        <p className="lead-note">{state.notificationStatus === "not_configured" ? C.notifyUnconfigured : C.notifyPending}</p>
      </section>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <section className="lead-form enquiry-form">
      <h2>{V.heading}</h2>
      <p className="lead-intro">{V.intro}</p>
      {state.kind === "error" && (
        <p className="lead-error" role="alert"><strong>{C.errorTitle}:</strong> {state.message}</p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="enquiry-grid">
          <label>
            {C.name}
            <input name="name" type="text" required minLength={2} maxLength={120} autoComplete="name" />
          </label>
          <label>
            {C.email}
            <input name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr" />
          </label>
          <label>
            {V.org}
            <input name="organization" type="text" required maxLength={200} autoComplete="organization" />
          </label>
          <label>
            {C.role}
            <input name="role" type="text" maxLength={120} autoComplete="organization-title" />
          </label>
          <label>
            {C.phone}
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" dir="ltr" placeholder="+20 1XX XXX XXXX" />
          </label>
          <label>
            {C.country}
            <input name="country" type="text" maxLength={80} autoComplete="country-name" />
          </label>
          <label>
            {V.type}
            <select name="enquiryType" defaultValue="">
              <option value="" disabled>{C.choose}</option>
              {typeOptions.map((o) => <option key={o} value={o}>{typeLabels[o] ?? o}</option>)}
            </select>
          </label>
          <label>
            {V.size} <span className="field-optional">({C.optional})</span>
            <select name="participantRange" defaultValue="">
              <option value="">{C.choose}</option>
              {PARTICIPANT_RANGES.map((r) => <option key={r} value={r}>{C.ranges[r] ?? r}</option>)}
            </select>
          </label>
          <label>
            {C.timeline}
            <select name="timeline" defaultValue="">
              <option value="">{C.choose}</option>
              {TIMELINE_OPTIONS.map((tm) => <option key={tm} value={tm}>{C.timelines[tm] ?? tm}</option>)}
            </select>
          </label>
          {variant === "enterprise" && (
            <label>
              {variantCopy.enterprise[locale].budget} <span className="field-optional">({C.optional})</span>
              <select name="budgetRange" defaultValue="">
                <option value="">{C.choose}</option>
                {BUDGET_RANGES.map((b) => <option key={b} value={b}>{C.budgets[b] ?? b}</option>)}
              </select>
            </label>
          )}
        </div>

        {variant === "government" && (
          <label>
            {variantCopy.government[locale].beneficiaries}
            <textarea name="beneficiaries" maxLength={600} rows={2} />
          </label>
        )}

        <label>
          {C.message}
          <textarea name="message" required minLength={10} maxLength={4000} rows={5} />
        </label>

        <AcceptanceFields locale={locale} requirements={requirements} />

        <button className="primary-button" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? C.submitting : C.submit}
        </button>
      </form>
    </section>
  );
}
