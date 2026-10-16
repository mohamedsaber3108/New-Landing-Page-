"use client";

// Privacy / data-subject request form (instruction §9, ref 02 §10).
//
// Submits to POST /api/v1/privacy-requests, which stores the request and returns
// a receipt reference. The receipt confirms we received the request — it is NOT
// a completion, and no data is disclosed or deleted here. Identity is verified
// by staff before any fulfilment (shown clearly to set expectations).
//
// Mirrors the existing lead-form architecture: idempotency key per instance,
// success only on a genuine reference, entered data preserved on error.

import { useRef, useState } from "react";
import { PRIVACY_REQUEST_TYPES } from "@/db/schema";
import Link from "./nav-link";

type Locale = "en" | "ar";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; reference: string }
  | { kind: "error"; message: string };

const t = {
  en: {
    heading: "Submit a privacy request",
    intro:
      "Use this to exercise your rights over information this website holds. You will get a reference as a receipt. We verify your identity before disclosing, changing, or deleting any data — a request is never actioned on an email address alone.",
    type: "Request type",
    name: "Your name",
    email: "Email on the enquiry",
    related: "Related reference (optional)",
    relatedHint: "If you have a prior enquiry reference (e.g. USAM-XXXXXX), add it to help us locate your data.",
    message: "Details",
    messageHint: "Describe your request. Do not include passwords or payment details.",
    submit: "Submit request",
    submitting: "Submitting…",
    noticePre: "The details you enter are handled as described in our",
    privacyLink: "Privacy Policy",
    noticePost: ".",
    successTitle: "Request received",
    successBody: "Keep this reference. It confirms receipt — it is not approval, and no data has been disclosed or deleted yet.",
    verifyNote: "Next: a staff member will contact you to verify your identity before any action.",
    errorTitle: "We could not submit that",
    offline: "Could not reach the server. Please try again.",
    required: "Please complete the required fields.",
    types: {
      access: "Access my data",
      correction: "Correct my data",
      deletion: "Delete my data",
      "withdraw-consent": "Withdraw a consent",
      question: "General privacy question",
    } as Record<string, string>,
  },
  ar: {
    heading: "تقديم طلب خصوصية",
    intro:
      "استخدم هذا لممارسة حقوقك على المعلومات التي يحتفظ بها هذا الموقع. وستحصل على رقم مرجعي كإيصال. ونتحقق من هويتك قبل الإفصاح عن أي بيانات أو تغييرها أو حذفها — ولا يُنفَّذ أي طلب بالاعتماد على البريد الإلكتروني وحده.",
    type: "نوع الطلب",
    name: "الاسم",
    email: "البريد المستخدم في الاستفسار",
    related: "رقم مرجعي ذو صلة (اختياري)",
    relatedHint: "إذا كان لديك رقم استفسار سابق (مثل USAM-XXXXXX) فأضفه لمساعدتنا في تحديد بياناتك.",
    message: "التفاصيل",
    messageHint: "صف طلبك. ولا تُدرج كلمات المرور أو بيانات الدفع.",
    submit: "إرسال الطلب",
    submitting: "جارٍ الإرسال…",
    noticePre: "تُعالَج البيانات التي تُدخلها وفق ما هو موضّح في",
    privacyLink: "سياسة الخصوصية",
    noticePost: ".",
    successTitle: "تم استلام الطلب",
    successBody: "احتفظ بهذا الرقم. فهو يؤكد الاستلام — وليس موافقة، ولم يُفصح عن أي بيانات أو تُحذف بعد.",
    verifyNote: "التالي: سيتواصل معك موظف للتحقق من هويتك قبل أي إجراء.",
    errorTitle: "تعذّر إرسال الطلب",
    offline: "تعذّر الاتصال. حاول مرة أخرى.",
    required: "يرجى إكمال الحقول المطلوبة.",
    types: {
      access: "الاطّلاع على بياناتي",
      correction: "تصحيح بياناتي",
      deletion: "حذف بياناتي",
      "withdraw-consent": "سحب موافقة",
      question: "سؤال عام عن الخصوصية",
    } as Record<string, string>,
  },
} as const;

export function PrivacyRequestForm({ locale }: { locale: Locale }) {
  const L = t[locale];
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;
    const data = new FormData(event.currentTarget);
    const payload = {
      requestType: String(data.get("requestType") ?? "access"),
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      relatedReference: String(data.get("relatedReference") ?? "").trim() || undefined,
      locale,
      message: String(data.get("message") ?? "").trim() || undefined,
    };

    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/v1/privacy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => null)) as
        | { data?: { reference: string }; error?: { message: string } }
        | null;
      if (response.ok && json?.data?.reference) {
        setState({ kind: "success", reference: json.data.reference });
        return;
      }
      setState({ kind: "error", message: json?.error?.message ?? L.required });
    } catch {
      setState({ kind: "error", message: L.offline });
    }
  }

  if (state.kind === "success") {
    return (
      <section className="lead-form lead-form-success" role="status" aria-live="polite">
        <h2>{L.successTitle}</h2>
        <p>{L.successBody}</p>
        <p className="lead-reference"><bdi>{state.reference}</bdi></p>
        <p className="lead-note">{L.verifyNote}</p>
      </section>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <section className="lead-form" id="privacy-request-form">
      <h2>{L.heading}</h2>
      <p className="lead-intro">{L.intro}</p>
      {state.kind === "error" && (
        <p className="lead-error" role="alert">
          <strong>{L.errorTitle}:</strong> {state.message}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <label>
          {L.type}
          <select name="requestType" defaultValue="access">
            {PRIVACY_REQUEST_TYPES.map((rt) => (
              <option key={rt} value={rt}>{L.types[rt] ?? rt}</option>
            ))}
          </select>
        </label>
        <label>
          {L.name}
          <input name="name" type="text" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label>
          {L.email}
          <input name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr" />
        </label>
        <label>
          {L.related}
          <input name="relatedReference" type="text" maxLength={60} />
          <span className="lead-hint">{L.relatedHint}</span>
        </label>
        <label>
          {L.message}
          <textarea name="message" maxLength={2000} rows={4} />
          <span className="lead-hint">{L.messageHint}</span>
        </label>
        <p className="lead-notice">
          {L.noticePre} <Link href="/privacy">{L.privacyLink}</Link>{L.noticePost}
        </p>
        <button className="primary-button" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? L.submitting : L.submit}
        </button>
      </form>
    </section>
  );
}
