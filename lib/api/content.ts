// Server-side content source for the public read endpoints (handoff C01/C02/C06/C08/C10).
//
// This exposes the content the Master site already owns (products, informational
// page copy, FAQs) through a stable server shape. It deliberately does NOT turn
// provisional legal copy into an approved policy, and it reports status as
// "not_monitored" because no monitoring exists yet. Those honest states are part
// of the contract, not a limitation to hide.

import { products, routes, type Product } from "@/data/products";

export type Locale = "en" | "ar";

/** Public product record (no secret config), handoff C02/C03. */
export function publicProducts() {
  return products.map((p: Product) => ({
    id: p.id,
    name: p.name,
    arabicName: p.arabicName,
    description: p.description,
    arabicDescription: p.arabicDescription,
    destination: p.domain,
    agent: p.agent,
    features: p.features,
    arabicFeatures: p.arabicFeatures,
    // Integration level is link-only until a verified adapter exists.
    integrationLevel: "link_only" as const,
    availability: "external" as const,
  }));
}

/**
 * Published informational page sections. Mirrors the bilingual copy rendered by
 * components/page-content.tsx. Marked as the Master's own canonical records;
 * these are editorial, not legal, claims.
 */
type Section = [string, string, string, string];

const pageSections: Record<string, Section[]> = {
  about: [
    ["One starting point", "Begin with a goal, then continue in a specialist product. USAM Master brings the destinations together.", "نقطة بداية واحدة", "ابدأ بهدفك ثم أكمل داخل المنتج المتخصص. تجمع يوزم الرئيسية الوجهات في مكان واحد."],
    ["Learning that connects to work", "Build a skill in Education, prepare for opportunities in Career, and apply your expertise through Freelancing.", "تعلّم يرتبط بالعمل", "ابنِ مهارة في التعليم، واستعد للفرص في المسار المهني، وطبّق خبرتك من خلال العمل الحر."],
    ["A place for early discovery", "Kids offers a separate route for children and parents to explore learning through missions and projects.", "مساحة للاكتشاف المبكر", "يقدم منتج الأطفال مسارًا مستقلًا للأطفال وأولياء الأمور لاكتشاف التعلم بالمهمات والمشروعات."],
  ],
  contact: [
    ["Product help", "Open the platform where you need help and use its support channel. Include the page, what happened, and the result you expected.", "مساعدة في منتج", "افتح المنصة التي تحتاج المساعدة فيها واستخدم قناة دعمها. وضّح الصفحة وما حدث والنتيجة المتوقعة."],
    ["Partnership enquiries", "Prepare a brief with your organization, audience, objective, timeline, and a reply address.", "استفسارات الشراكات", "جهّز نبذة تشمل مؤسستك والفئة المستهدفة والهدف والموعد ووسيلة الرد."],
    ["Protect your information", "Do not include passwords, payment details, or sensitive personal documents in a general enquiry.", "احمِ معلوماتك", "لا تُدرج كلمات المرور أو بيانات الدفع أو المستندات الشخصية الحساسة في الاستفسار العام."],
  ],
};

export function publicPage(slug: string, locale: Locale) {
  const route = routes[slug];
  if (!route) return null;
  const sections = (pageSections[slug] ?? []).map(([tEn, bEn, tAr, bAr]) => ({
    title: locale === "ar" ? tAr : tEn,
    body: locale === "ar" ? bAr : bEn,
  }));
  return {
    slug,
    locale,
    label: route.label,
    title: route.title,
    intro: route.intro,
    sections,
    // Content lives in source today; CMS versioning is a later phase.
    source: "static" as const,
  };
}

/** Published FAQ answers (handoff C06). */
const faqs: Section[] = [
  ["Where should I start?", "Choose Explore or describe your goal to the guide. You can open any product directly.", "من أين أبدأ؟", "اختر استكشف أو صف هدفك للدليل. ويمكنك فتح أي منتج مباشرة."],
  ["Is this one account for every product?", "Account requirements are determined by each destination. Check the sign-in options on the platform you choose.", "هل يوجد حساب واحد لكل المنتجات؟", "تحدّد كل منصة متطلبات الحساب. راجع خيارات تسجيل الدخول في المنصة التي تختارها."],
  ["Can I move between learning and career preparation?", "Yes. Use Education to build skills and Career to explore opportunities and prepare applications.", "هل يمكنني الانتقال بين التعلم والاستعداد المهني؟", "نعم. استخدم التعليم لبناء المهارات، والمسار المهني لاستكشاف الفرص وتجهيز طلبات التقديم."],
  ["Does this guide provide live AI answers?", "This gateway uses a local goal matcher. Specialist experiences are available through the product links.", "هل يقدم هذا الدليل إجابات ذكاء اصطناعي مباشرة؟", "تستخدم هذه البوابة مطابقة محلية للأهداف. تتوفر التجارب المتخصصة عبر روابط المنتجات."],
  ["Where are prices and subscriptions?", "Open the relevant product to review its current plans and conditions.", "أين الأسعار والاشتراكات؟", "افتح المنتج المناسب لمراجعة خططه وشروطه الحالية."],
  ["How do parents begin?", "Visit Kids & Parents, review the activities, and continue to the Kids platform together.", "كيف يبدأ أولياء الأمور؟", "زوروا صفحة الأطفال وأولياء الأمور، وراجعوا الأنشطة، ثم انتقلوا إلى منصة الأطفال معًا."],
];

export function publicFaqs(locale: Locale) {
  return faqs.map(([qEn, aEn, qAr, aAr], i) => ({
    id: `faq-${i + 1}`,
    question: locale === "ar" ? qAr : qEn,
    answer: locale === "ar" ? aAr : aEn,
  }));
}

/**
 * Legal documents (handoff C08). The current copy is PROVISIONAL navigational
 * text, not an approved notice. The API says so explicitly via `approval`.
 */
export const LEGAL_TYPES = ["privacy", "terms", "cookies"] as const;
export type LegalType = (typeof LEGAL_TYPES)[number];

const legalBodies: Record<LegalType, Section[]> = {
  privacy: [
    ["Your destination matters", "Each specialist platform may process different information. Review the privacy notice available within that platform before using its services.", "الوجهة تحدّد التفاصيل", "قد تتعامل كل منصة متخصصة مع معلومات مختلفة. راجع إشعار الخصوصية داخلها قبل استخدام خدماتها."],
    ["Using the gateway", "The route selector matches your typed goal in this page. It is not a connected AI conversation. Do not enter sensitive information.", "استخدام البوابة", "يطابق محدّد المسار هدفك المكتوب داخل هذه الصفحة. وهو ليس محادثة متصلة بنموذج ذكاء اصطناعي. لا تُدخل معلومات حساسة."],
  ],
  terms: [
    ["Gateway and product services", "USAM Master helps you find a destination. Access, subscriptions, payments, and service conditions belong to the product you enter.", "البوابة وخدمات المنتجات", "تساعدك يوزم الرئيسية على اختيار وجهة. ترتبط شروط الدخول والاشتراك والدفع والخدمة بالمنتج الذي تستخدمه."],
    ["Before committing", "Review the destination's published terms, cancellation conditions, and privacy information. This directory does not replace those documents.", "قبل الالتزام", "راجع شروط الوجهة المنشورة وأحكام الإلغاء ومعلومات الخصوصية. لا يحل هذا الدليل محل تلك المستندات."],
  ],
  cookies: [
    ["Website preferences", "Language and theme preferences are saved on this browser so they carry across visits and pages.", "تفضيلات الموقع", "تُحفظ اللغة والمظهر في هذا المتصفح بين الصفحات والزيارات."],
    ["Browser controls", "Manage stored site data using your browser's privacy settings. Clearing data can sign you out of connected services.", "إعدادات المتصفح", "أدر بيانات المواقع المخزّنة من إعدادات الخصوصية في متصفحك. قد يؤدي مسح البيانات إلى تسجيل خروجك من الخدمات المتصلة."],
  ],
};

export function publicLegal(type: LegalType, locale: Locale) {
  return {
    type,
    locale,
    sections: legalBodies[type].map(([tEn, bEn, tAr, bAr]) => ({
      title: locale === "ar" ? tAr : tEn,
      body: locale === "ar" ? bAr : bEn,
    })),
    // Honest status: not an approved policy yet.
    approval: "provisional" as const,
    version: null as string | null,
    effectiveAt: null as string | null,
  };
}

/**
 * Service status (handoff C10/P19). No monitoring exists, so every component is
 * reported "not_monitored" with no freshness claim. This must not render as a
 * green "operational" state.
 */
export function publicStatus() {
  const components = products.map((p: Product) => ({
    id: p.id,
    name: p.name,
    destination: p.domain,
    state: "not_monitored" as const,
    checkedAt: null as string | null,
  }));
  return {
    overall: "not_monitored" as const,
    monitoringEnabled: false,
    note: "USAM Master does not currently run live service monitoring. Open a product to check access directly.",
    components,
    incidents: [] as Array<Record<string, unknown>>,
  };
}
