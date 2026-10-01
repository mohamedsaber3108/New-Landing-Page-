"use client";

import { useRef, useState } from "react";
import { ENQUIRY_KINDS, ENQUIRY_PRODUCTS } from "@/db/schema";

type Locale = "en" | "ar";

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; reference: string; notificationStatus: string }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string[]> };

const t = {
  en: {
    heading: "Send an enquiry",
    intro: "General questions, partnerships, or enterprise needs. We store your message securely and reply by email.",
    name: "Your name",
    email: "Reply email",
    organization: "Organization (optional)",
    kind: "Enquiry type",
    product: "Related product (optional)",
    none: "Not specific",
    message: "Message",
    messageHint: "Describe what you want to achieve. Do not include passwords or payment details.",
    marketing: "Send me occasional product updates (optional)",
    submit: "Send enquiry",
    submitting: "Sending…",
    successTitle: "Enquiry received",
    successBody: "Keep this reference for follow-up:",
    notifyPending: "We will route it to the team shortly.",
    notifyUnconfigured: "Notifications are not configured yet, so your enquiry is saved and queued for the team.",
    errorTitle: "We could not send that",
    kinds: { general: "General", "product-help": "Product help", partnership: "Partnership", government: "Government", enterprise: "Enterprise" } as Record<string, string>,
    products: { education: "Education", career: "Career", freelancing: "Freelancing", kids: "Kids", ecosystem: "Ecosystem" } as Record<string, string>,
    required: "Please complete the required fields.",
  },
  ar: {
    heading: "أرسل استفسارًا",
    intro: "للأسئلة العامة أو الشراكات أو احتياجات المؤسسات. نحفظ رسالتك بأمان ونرد عبر البريد الإلكتروني.",
    name: "الاسم",
    email: "بريد الرد",
    organization: "المؤسسة (اختياري)",
    kind: "نوع الاستفسار",
    product: "المنتج المعني (اختياري)",
    none: "غير محدد",
    message: "الرسالة",
    messageHint: "صف ما تريد تحقيقه. لا تُدرج كلمات المرور أو بيانات الدفع.",
    marketing: "أرسلوا لي تحديثات المنتج أحيانًا (اختياري)",
    submit: "إرسال الاستفسار",
    submitting: "جارٍ الإرسال…",
    successTitle: "تم استلام الاستفسار",
    successBody: "احتفظ بهذا الرقم المرجعي للمتابعة:",
    notifyPending: "سنوجّهه إلى الفريق قريبًا.",
    notifyUnconfigured: "لم تُفعّل الإشعارات بعد، لذا حُفظ استفسارك وأُدرج في قائمة انتظار الفريق.",
    errorTitle: "تعذّر إرسال الاستفسار",
    kinds: { general: "عام", "product-help": "مساعدة في منتج", partnership: "شراكة", government: "جهة حكومية", enterprise: "مؤسسة" } as Record<string, string>,
    products: { education: "التعليم", career: "المسار المهني", freelancing: "العمل الحر", kids: "الأطفال", ecosystem: "المنظومة" } as Record<string, string>,
    required: "يرجى إكمال الحقول المطلوبة.",
  },
} as const;

export function ContactLeadForm({ locale }: { locale: Locale }) {
  const L = t[locale];
  const ar = locale === "ar";
  const [state, setState] = useState<FormState>({ kind: "idle" });
  // One idempotency key per form instance until a submission succeeds, so a
  // double-click or a network retry cannot create duplicate leads.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      organization: String(data.get("organization") ?? "").trim() || undefined,
      kind: String(data.get("kind") ?? "general"),
      product: data.get("product") ? String(data.get("product")) : undefined,
      locale,
      message: String(data.get("message") ?? "").trim(),
      marketingOptIn: data.get("marketingOptIn") === "on",
    };

    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/v1/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => null)) as
        | { data?: { reference: string; notificationStatus: string }; error?: { message: string; fieldErrors?: Record<string, string[]> } }
        | null;

      // Only a genuine 2xx with a reference is success. Anything else is an error.
      if (response.ok && json?.data?.reference) {
        setState({
          kind: "success",
          reference: json.data.reference,
          notificationStatus: json.data.notificationStatus,
        });
        return;
      }

      setState({
        kind: "error",
        message: json?.error?.message ?? L.required,
        fieldErrors: json?.error?.fieldErrors,
      });
    } catch {
      setState({
        kind: "error",
        message: ar ? "تعذّر الاتصال. حاول مرة أخرى." : "Could not reach the server. Please try again.",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <section className="lead-form lead-form-success" role="status" aria-live="polite">
        <h2>{L.successTitle}</h2>
        <p>{L.successBody}</p>
        <p className="lead-reference"><bdi>{state.reference}</bdi></p>
        <p className="lead-note">
          {state.notificationStatus === "not_configured" ? L.notifyUnconfigured : L.notifyPending}
        </p>
      </section>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <section className="lead-form">
      <h2>{L.heading}</h2>
      <p className="lead-intro">{L.intro}</p>
      {state.kind === "error" && (
        <p className="lead-error" role="alert">
          <strong>{L.errorTitle}:</strong> {state.message}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <label>
          {L.name}
          <input name="name" type="text" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label>
          {L.email}
          <input name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr" />
        </label>
        <label>
          {L.organization}
          <input name="organization" type="text" maxLength={200} autoComplete="organization" />
        </label>
        <label>
          {L.kind}
          <select name="kind" defaultValue="general">
            {ENQUIRY_KINDS.map((k) => (
              <option key={k} value={k}>{L.kinds[k] ?? k}</option>
            ))}
          </select>
        </label>
        <label>
          {L.product}
          <select name="product" defaultValue="">
            <option value="">{L.none}</option>
            {ENQUIRY_PRODUCTS.map((p) => (
              <option key={p} value={p}>{L.products[p] ?? p}</option>
            ))}
          </select>
        </label>
        <label>
          {L.message}
          <textarea name="message" required minLength={10} maxLength={4000} rows={5} />
          <span className="lead-hint">{L.messageHint}</span>
        </label>
        <label className="lead-checkbox">
          <input name="marketingOptIn" type="checkbox" />
          <span>{L.marketing}</span>
        </label>
        <button className="primary-button" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? L.submitting : L.submit}
        </button>
      </form>
    </section>
  );
}
