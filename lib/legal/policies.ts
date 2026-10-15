// USAM Master — central legal policy source of truth.
//
// SCOPE: this models the Master website only (usamif.com), a bilingual
// discovery / enquiry portal that does NOT sell products or take payment.
// Payment, course, recruitment and marketplace terms belong to the selling
// platforms (Education, Career, Freelancing, Kids) and are linked, not copied.
//
// HONESTY RULES baked into this model:
//  - Every policy carries an explicit `approval` state. "draft" means the text
//    is provisional and MUST NOT be presented as an approved/binding notice.
//    "published" is reserved for text a human has reviewed and released; the
//    admin workflow flips that, nothing here hard-codes "published".
//  - Business facts that are not verified are written as REVIEW placeholders
//    using the token `[FOR REVIEW — …]` (Arabic: `[للمراجعة — …]`), each a
//    single marker (never slash-separated alternatives presented as final
//    wording), so they are visible and greppable, never silently invented.
//  - EN and AR variants of one policy share a single version string so the two
//    languages always represent the same release.
//
// The admin policy-version store (db) can OVERRIDE any field at runtime; this
// module is the built-in baseline/default and the fallback when no published
// override exists.

export type Locale = "en" | "ar";

/** Lifecycle of a policy release (mirrors the admin workflow + ref 02 §6). */
export type Approval = "draft" | "in_review" | "published" | "retired";

/** Which audiences a policy section is most relevant to. */
export type Audience = "all" | "individuals" | "enterprises" | "government" | "kids";

/** A single policy document type the Master hosts. */
export type PolicyType =
  | "privacy"
  | "terms"
  | "cookies"
  | "refunds"
  | "payments"
  | "ai-use"
  | "privacy-requests";

export type PolicySection = {
  /** Stable anchor id (kebab-case) for deep links within the page. */
  id: string;
  en: { heading: string; body: string[] };
  ar: { heading: string; body: string[] };
  /**
   * When true, this section states a legal/business COMMITMENT (e.g. retention
   * period, lawful basis, governing law) that is not yet confirmed. Its `body`
   * contains internal [FOR REVIEW …] markers and must NOT be shown to the
   * public verbatim. The public view instead shows the heading plus a short,
   * user-appropriate "being finalized" note. Informational sections (the
   * default) are shown in full — they describe how the site actually behaves.
   */
  pending?: boolean;
};

export type Policy = {
  type: PolicyType;
  /** Public route for this policy page. */
  path: string;
  /** Shared release version across both languages (ref 02 §35). */
  version: string;
  /**
   * Effective date (ISO) once published, else null. A draft has no effective
   * date — publishing is an explicit human action, not a side effect of code.
   */
  effectiveAt: string | null;
  /** Last content revision date (ISO), for "last updated" display. */
  updatedAt: string;
  approval: Approval;
  title: { en: string; ar: string };
  /** One-line scope statement shown under the title. */
  scope: { en: string; ar: string };
  /** Which USAM surfaces this policy governs. */
  appliesTo: { en: string; ar: string };
  audience: Audience;
  sections: PolicySection[];
};

// ---------------------------------------------------------------------------
// Shared contact + entity placeholders (NOT invented — flagged for config).
// ---------------------------------------------------------------------------

/**
 * The responsible operator identity and privacy contact. These are the facts a
 * site owner must configure with legal review before publication. We expose
 * them as placeholders so the UI can render a visible REVIEW marker rather than
 * a fabricated company name / address / DPO.
 */
export const RESPONSIBLE_CONTACT = {
  // Trading name is safe to state. The exact REGISTERED names/address/number
  // must come from the company's registration documents — do not invent the
  // registered spelling. Marked [FOR REVIEW …] until supplied.
  operatorDisplayName: "USAM",
  legalEntity: "[FOR REVIEW — exact registered English legal name (Egyptian LLC)]",
  legalEntityAr: "[للمراجعة — الاسم القانوني العربي المسجّل بدقّة (ش.ذ.م.م مصرية)]",
  address: "[FOR REVIEW — registered address]",
  addressAr: "[للمراجعة — العنوان المسجّل]",
  // Optional: only published if provided.
  registrationNumber: "" as string, // e.g. commercial registration no.; empty = omit
  privacyEmail: "[FOR REVIEW — existing, monitored privacy email]",
  // Contact label only — does NOT assert a formally appointed DPO.
  contactLabel: "USAM Privacy Team",
} as const;

/** The selling platforms the Master routes to (payment/accounts live there). */
export const PLATFORMS = [
  { id: "education", label: { en: "USAM Education", ar: "يوزم للتعليم" }, url: "https://edu.usamif.com" },
  { id: "career", label: { en: "USAM Career", ar: "يوزم للمسار المهني" }, url: "https://jobs.usamif.com" },
  { id: "freelancing", label: { en: "USAM Freelancing", ar: "يوزم للعمل الحر" }, url: "https://freelancing-platform.usamif.com" },
  { id: "kids", label: { en: "USAM Kids", ar: "يوزم للأطفال" }, url: "https://kids.usamif.com" },
] as const;

/** Base/default currency for USAM-owned pricing (instruction §5). */
export const BASE_CURRENCY = "EGP" as const;

// ---------------------------------------------------------------------------
// Applicable legal frameworks (VERIFIED from official-source review; see the
// gap report for citations). These are stated as "frameworks we align the
// architecture to", not a compliance claim.
// ---------------------------------------------------------------------------

export const LEGAL_FRAMEWORKS = [
  {
    jurisdiction: { en: "Egypt", ar: "مصر" },
    law: {
      en: "Personal Data Protection Law No. 151 of 2020 and its Executive Regulations (Minister of Communications and Information Technology Decree No. 816 of 2025).",
      ar: "قانون حماية البيانات الشخصية رقم 151 لسنة 2020 ولائحته التنفيذية (قرار وزير الاتصالات وتكنولوجيا المعلومات رقم 816 لسنة 2025).",
    },
    note: {
      en: "Full-compliance date for in-scope organizations: 31 October 2026. Supervised by the Egyptian Personal Data Protection Centre (PDPC).",
      ar: "موعد الامتثال الكامل للجهات الخاضعة: 31 أكتوبر 2026. يشرف عليه مركز حماية البيانات الشخصية المصري.",
    },
  },
  {
    jurisdiction: { en: "Saudi Arabia", ar: "المملكة العربية السعودية" },
    law: {
      en: "Personal Data Protection Law (Royal Decree M/19, amended by M/148) and its Implementing Regulations.",
      ar: "نظام حماية البيانات الشخصية (المرسوم الملكي م/19 المعدّل بالمرسوم م/148) ولائحته التنفيذية.",
    },
    note: {
      en: "Fully enforceable since 14 September 2024. Competent authority: SDAIA.",
      ar: "نافذ بالكامل منذ 14 سبتمبر 2024. الجهة المختصة: الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا).",
    },
  },
] as const;

// Keep a single global release version for the built-in baseline. Bumping this
// (and the admin re-publishing) is what re-points consent evidence to a new
// release. Date-based so it reads naturally in the UI.
export const BASELINE_VERSION = "2026-02-draft-1";

// All built-in baselines ship as drafts: the text is provisional and must be
// reviewed/published by a human before it is binding. The admin store can
// publish an approved version that overrides this.
const DRAFT: Approval = "draft";
const noEffectiveDate = null;
const BUILT_AT = "2026-02-01";

// ---------------------------------------------------------------------------
// Policy documents (built-in baseline, DRAFT). English + Arabic are authored
// in parallel (not machine-translated) and share one version.
// ---------------------------------------------------------------------------

const privacy: Policy = {
  type: "privacy",
  path: "/privacy",
  version: BASELINE_VERSION,
  effectiveAt: noEffectiveDate,
  updatedAt: BUILT_AT,
  approval: DRAFT,
  title: { en: "Privacy Policy", ar: "سياسة الخصوصية" },
  scope: {
    en: "How the USAM Master website (usamif.com) handles information. The learning, career, freelancing and kids platforms publish their own privacy notices.",
    ar: "كيف يتعامل موقع يوزم الرئيسي (usamif.com) مع المعلومات. تنشر منصات التعليم والمسار المهني والعمل الحر والأطفال إشعارات خصوصية خاصة بها.",
  },
  appliesTo: {
    en: "usamif.com (the Master discovery and enquiry website).",
    ar: "موقع usamif.com (موقع الاكتشاف والاستفسار الرئيسي).",
  },
  audience: "all",
  sections: [
    {
      id: "who-we-are",
      en: {
        heading: "Who is responsible",
        body: [
          `This website (usamif.com) is operated by ${RESPONSIBLE_CONTACT.legalEntity}, an Egyptian limited liability company, registered at ${RESPONSIBLE_CONTACT.address}${RESPONSIBLE_CONTACT.registrationNumber ? ` (commercial registration ${RESPONSIBLE_CONTACT.registrationNumber})` : ""}. We trade as "USAM".`,
          `For privacy matters, contact the USAM Privacy Team at ${RESPONSIBLE_CONTACT.privacyEmail}.`,
          "The Master website helps you discover the right USAM platform and send enquiries. Separate companies/teams may operate individual platforms; each platform's own privacy notice governs the data you share there.",
        ],
      },
      ar: {
        heading: "من المسؤول",
        body: [
          `يُشغّل هذا الموقع (usamif.com) ${RESPONSIBLE_CONTACT.legalEntityAr}، وهي شركة مصرية ذات مسؤولية محدودة، ومقرّها ${RESPONSIBLE_CONTACT.addressAr}${RESPONSIBLE_CONTACT.registrationNumber ? ` (سجل تجاري رقم ${RESPONSIBLE_CONTACT.registrationNumber})` : ""}. ونعمل تحت اسم «يوزم».`,
          `لمسائل الخصوصية، تواصل مع فريق خصوصية يوزم عبر ${RESPONSIBLE_CONTACT.privacyEmail}.`,
          "يساعدك الموقع الرئيسي على اكتشاف المنصة المناسبة وإرسال الاستفسارات. وقد تُشغّل المنصات المختلفة جهات مستقلة؛ ويحكم إشعار الخصوصية الخاص بكل منصة البيانات التي تشاركها هناك.",
        ],
      },
    },
    {
      id: "what-we-collect",
      en: {
        heading: "What this website collects",
        body: [
          "Enquiry data: when you submit the contact, enterprise or government form, we store the name, email, optional organization, your message, the enquiry type, your chosen language, and any structured fields you complete (role, phone, country, timeline, participant range, budget range, beneficiaries). If you reached this site signed in through ChatGPT, a signed-in account identifier may be stored with your enquiry; otherwise it is recorded as anonymous.",
          "Privacy-request data: if you submit a privacy request, we store your name, email, request type, any reference you give us, your message, and the workflow status (including whether identity has been verified) so we can handle and evidence the request.",
          "Consent and acceptance records: when Terms acceptance, a privacy-notice presentation, a marketing choice, or a cookie choice occurs, we record that event with its policy version, purpose, timestamp and language, to show what happened and when.",
          "Helpfulness feedback: if you rate a page or FAQ as helpful or not, we store only that rating and the content id — no free text and nothing that identifies you.",
          "Guide signals: when you use the Ask USAM guide, we store only the resolved destination intent and language — never the words you typed.",
          "Preferences: your language and light/dark theme choices are stored in your browser (local storage), on your device, not on our servers.",
          "Operational records: your submissions are held in our database, and a queued internal notification record is created for each (containing a reference, not your message body). Our web server keeps standard access and error logs in the default format — including the visitor's IP address, date and time, the request line, response status, bytes sent, referrer and browser user-agent — rotated daily and retained for about 14 days before deletion. Whether the underlying cloud infrastructure also keeps automated snapshots or backups is [FOR REVIEW — automated backup coverage not yet confirmed; requires AWS-side verification].",
          "We do not run advertising trackers or third-party analytics on this website. See the Cookie Policy for the full inventory.",
        ],
      },
      ar: {
        heading: "ما يجمعه هذا الموقع",
        body: [
          "بيانات الاستفسار: عند إرسال نموذج التواصل أو المؤسسات أو الجهات الحكومية، نحفظ الاسم والبريد الإلكتروني واسم المؤسسة (اختياري) ورسالتك ونوع الاستفسار ولغتك المختارة وأي حقول منظّمة تكملها (الدور، الهاتف، الدولة، الإطار الزمني، نطاق المشاركين، نطاق الميزانية، الفئات المستفيدة). وإذا وصلت إلى الموقع مسجّلًا الدخول عبر ChatGPT، فقد يُحفظ معرّف حساب مع استفسارك؛ وإلا فيُسجَّل كمجهول.",
          "بيانات طلب الخصوصية: عند تقديم طلب خصوصية، نحفظ اسمك وبريدك ونوع الطلب وأي رقم مرجعي تزوّدنا به ورسالتك وحالة سير العمل (بما في ذلك ما إذا تم التحقق من الهوية) لمعالجة الطلب وإثباته.",
          "سجلات الموافقة والقبول: عند حدوث قبول للشروط أو عرض لإشعار الخصوصية أو اختيار تسويقي أو اختيار لملفات الارتباط، نسجّل ذلك الحدث مع إصدار السياسة والغرض والوقت واللغة؛ لإثبات ما حدث ومتى.",
          "تقييم الفائدة: إذا قيّمت صفحة أو سؤالًا شائعًا بأنه مفيد أو غير مفيد، فإننا نحفظ التقييم ومعرّف المحتوى فقط — دون أي نص حر ودون ما يحدد هويتك.",
          "إشارات الدليل: عند استخدام دليل «اسأل يوزم»، نحفظ فقط الوجهة المقصودة واللغة — ولا نحفظ ما كتبته أبدًا.",
          "التفضيلات: تُحفظ لغتك واختيارك للوضع الفاتح/الداكن في متصفحك (التخزين المحلي) على جهازك، لا على خوادمنا.",
          "السجلات التشغيلية: تُحفظ طلباتك في قاعدة بياناتنا، ويُنشأ سجل إشعار داخلي في قائمة انتظار لكل منها (يحتوي على رقم مرجعي لا على نص رسالتك). ويحتفظ خادم الويب لدينا بسجلات وصول وأخطاء معتادة بالصيغة الافتراضية — تشمل عنوان IP للزائر والتاريخ والوقت وسطر الطلب وحالة الاستجابة وحجم البيانات والمُحيل ومتصفح المستخدم — تُدوَّر يوميًا وتُحفظ نحو 14 يومًا قبل حذفها. أما إن كانت البنية السحابية الأساسية تحتفظ أيضًا بلقطات أو نسخ احتياطية تلقائية فذلك [للمراجعة — تغطية النسخ الاحتياطي التلقائي غير مؤكدة بعد؛ تتطلب تحققًا من جهة AWS].",
          "لا نشغّل أدوات تتبّع إعلانية ولا تحليلات من أطراف ثالثة على هذا الموقع. راجع سياسة ملفات الارتباط للاطّلاع على الجرد الكامل.",
        ],
      },
    },
    {
      id: "why-and-basis",
      en: {
        heading: "Why we use it",
        body: [
          "We use this information to respond to your enquiry and route it to the correct USAM team; to receive and handle privacy requests; to remember your language and theme; to keep an auditable record of the choices you make here; to understand, in aggregate, where visitors want to go; and to operate and secure the website.",
          "We do not treat acknowledging this notice as blanket consent for unrelated processing.",
        ],
      },
      ar: {
        heading: "لماذا نستخدمها",
        body: [
          "نستخدم هذه المعلومات للرد على استفسارك وتوجيهه إلى فريق يوزم المناسب؛ ولاستلام طلبات الخصوصية ومعالجتها؛ ولتذكّر لغتك ومظهرك؛ وللاحتفاظ بسجل قابل للمراجعة لاختياراتك هنا؛ ولفهم وجهة الزوّار بشكل إجمالي؛ ولتشغيل الموقع وتأمينه.",
          "ولا نعتبر الإقرار بهذا الإشعار موافقةً شاملةً على معالجات غير ذات صلة.",
        ],
      },
    },
    {
      id: "legal-basis",
      pending: true,
      en: {
        heading: "Our legal basis",
        body: [
          "The specific lawful basis for each purpose under the applicable Egyptian and Saudi data-protection frameworks is [FOR REVIEW — lawful basis per purpose, to be confirmed by counsel].",
        ],
      },
      ar: {
        heading: "أساسنا القانوني",
        body: [
          "الأساس القانوني لكل غرض بموجب الأطر المصرية والسعودية لحماية البيانات [للمراجعة — الأساس القانوني لكل غرض، يؤكده المستشار القانوني].",
        ],
      },
    },
    {
      id: "sharing-and-platforms",
      en: {
        heading: "Sharing, platforms and processors",
        body: [
          "When you continue to a platform (Education, Career, Freelancing, Kids), you leave this website and that platform's own terms and privacy notice apply. A choice you make here does not automatically authorize processing on another platform.",
          "Verified processors used by this website: our cloud hosting provider processes the data on our instructions (the website and its database run on cloud infrastructure in Europe — see International transfers). We do not use third-party analytics or advertising processors on this site.",
          "Email sent to our domain is routed to Google (per our mail configuration), so Google processes inbound email on our behalf. The specific privacy mailbox and that it is actively monitored are [FOR REVIEW — confirm the privacy mailbox exists and is monitored]. Any further operational processors are [FOR REVIEW — confirm any additional processors]. The complete, maintained processor list is kept in our internal processor inventory.",
        ],
      },
      ar: {
        heading: "المشاركة والمنصات والمعالِجون",
        body: [
          "عند الانتقال إلى منصة (التعليم أو المسار المهني أو العمل الحر أو الأطفال)، تغادر هذا الموقع وتسري شروط تلك المنصة وإشعار خصوصيتها. والاختيار الذي تتخذه هنا لا يُصرّح تلقائيًا بالمعالجة على منصة أخرى.",
          "المعالِجون المؤكدون لهذا الموقع: يعالج مزوّد الاستضافة السحابية البيانات وفق تعليماتنا (يعمل الموقع وقاعدة بياناته على بنية سحابية في أوروبا — راجع النقل الدولي). ولا نستخدم معالِجي تحليلات أو إعلانات من أطراف ثالثة على هذا الموقع.",
          "يُوجَّه البريد المُرسَل إلى نطاقنا إلى Google (وفق إعداد البريد لدينا)، لذا يعالج Google البريد الوارد نيابةً عنّا. أما صندوق بريد الخصوصية المحدد وكونه مُراقَبًا فعليًا فذلك [للمراجعة — تأكيد وجود صندوق بريد الخصوصية ومراقبته]. وأي معالِجين تشغيليين إضافيين [للمراجعة — تأكيد أي معالِجين إضافيين]. وتُحفظ قائمة المعالِجين الكاملة والمحدّثة في جرد المعالِجين الداخلي.",
        ],
      },
    },
    {
      id: "retention-and-rights",
      en: {
        heading: "Keeping data and your rights",
        body: [
          "We keep each type of record only as long as needed for its purpose and a reasonable follow-up period. We will not state a specific retention period as a promise until a process that enforces it is in place; a documented, authorized and tested deletion procedure is not yet in place.",
          "You may ask to access, correct or delete your data, or withdraw an optional consent, through the Privacy Requests page. Submitting a request gives you a receipt reference confirming we received it — receipt is not fulfilment. Each request is reviewed by our team, and we verify your identity before any disclosure, change or deletion; we never act on an email address alone. The end-to-end fulfilment procedure and response timeframes are still being finalized.",
        ],
      },
      ar: {
        heading: "حفظ البيانات وحقوقك",
        body: [
          "نحتفظ بكل نوع من السجلات فقط للمدة اللازمة لغرضه ولفترة متابعة معقولة. ولن نذكر مدة احتفاظ محددة كوعد قبل وجود عملية تنفّذها؛ ولا يوجد بعد إجراء حذف موثّق ومُصرّح به ومُختبَر.",
          "ويمكنك طلب الاطّلاع على بياناتك أو تصحيحها أو حذفها، أو سحب موافقة اختيارية، عبر صفحة طلبات الخصوصية. ويمنحك تقديم الطلب رقمًا مرجعيًا يؤكد استلامنا له — والاستلام ليس تنفيذًا. ويراجع فريقنا كل طلب، ونتحقق من هويتك قبل أي إفصاح أو تغيير أو حذف؛ ولا نتصرّف بالاعتماد على البريد الإلكتروني وحده. وما زال إجراء التنفيذ الكامل والمدد الزمنية قيد الإعداد.",
        ],
      },
    },
    {
      id: "retention-rights-pending",
      pending: true,
      en: {
        heading: "Exact retention periods and applicable rights",
        body: [
          "The exact retention periods per record type, the specific rights available, and any legal retention exceptions are [FOR REVIEW — retention periods and applicable rights/exceptions, to be confirmed by counsel].",
        ],
      },
      ar: {
        heading: "مدد الاحتفاظ الدقيقة والحقوق المنطبقة",
        body: [
          "مدد الاحتفاظ الدقيقة لكل نوع سجل، والحقوق المتاحة تحديدًا، وأي استثناءات قانونية للاحتفاظ [للمراجعة — مدد الاحتفاظ والحقوق/الاستثناءات، يؤكدها المستشار القانوني].",
        ],
      },
    },
    {
      id: "children",
      en: {
        heading: "Children",
        body: [
          "This Master website is intended for adults exploring the ecosystem, including parents. The USAM Kids platform runs its own age-appropriate rules and parent/guardian notices; those apply when you continue to Kids. Age thresholds and guardian-consent mechanics are configured on that platform and are [FOR REVIEW — Kids age/guardian rules, platform-side].",
        ],
      },
      ar: {
        heading: "الأطفال",
        body: [
          "هذا الموقع الرئيسي موجّه للبالغين الذين يستكشفون المنظومة، بمن فيهم أولياء الأمور. وتُطبّق منصة «يوزم للأطفال» قواعدها الملائمة للعمر وإشعارات ولي الأمر، وتسري عند الانتقال إليها. وحدود العمر وآليات موافقة ولي الأمر مُهيّأة على تلك المنصة و[تتطلب مراجعة قانونية].",
        ],
      },
    },
    {
      id: "changes-and-contact",
      en: {
        heading: "Changes and contact",
        body: [
          "We keep previous versions of this policy and record its version with your acknowledgement. If we make a material change we will show it appropriately rather than forcing acceptance on every visit.",
          `Privacy contact: the USAM Privacy Team at ${RESPONSIBLE_CONTACT.privacyEmail}. You can also submit a request through the Privacy Requests page.`,
        ],
      },
      ar: {
        heading: "التغييرات والتواصل",
        body: [
          "نحتفظ بالإصدارات السابقة من هذه السياسة ونسجّل إصدارها مع إقرارك. وإذا أجرينا تغييرًا جوهريًا فسنعرضه بشكل مناسب بدلًا من فرض القبول في كل زيارة.",
          `جهة التواصل للخصوصية: فريق خصوصية يوزم عبر ${RESPONSIBLE_CONTACT.privacyEmail}. ويمكنك أيضًا إرسال طلب عبر صفحة طلبات الخصوصية.`,
        ],
      },
    },
  ],
};

const terms: Policy = {
  type: "terms",
  path: "/terms",
  version: BASELINE_VERSION,
  effectiveAt: noEffectiveDate,
  updatedAt: BUILT_AT,
  approval: DRAFT,
  title: { en: "Terms of Use", ar: "شروط الاستخدام" },
  scope: {
    en: "The rules for using the USAM Master website. Buying, accounts, and services happen on the platforms under their own terms.",
    ar: "قواعد استخدام موقع يوزم الرئيسي. أما الشراء والحسابات والخدمات فتتم على المنصات وفق شروطها الخاصة.",
  },
  appliesTo: {
    en: "usamif.com. These terms do not govern platform purchases or accounts.",
    ar: "موقع usamif.com. ولا تحكم هذه الشروط مشتريات المنصات أو حساباتها.",
  },
  audience: "all",
  sections: [
    {
      id: "role",
      en: {
        heading: "What this website is",
        body: [
          "USAM Master is a discovery and enquiry portal. It presents the ecosystem, explains features, lets you send an enquiry, and directs you to the relevant platform. It does not sell products, process payments, or create a user account on this website.",
          "Access, subscriptions, payments, certificates and service conditions belong to the platform you choose to enter (Education, Career, Freelancing, Kids). Review that platform's own terms before committing.",
        ],
      },
      ar: {
        heading: "ما هذا الموقع",
        body: [
          "يوزم الرئيسي بوابة اكتشاف واستفسار. تعرض المنظومة وتشرح المزايا وتتيح إرسال استفسار وتوجّهك إلى المنصة المناسبة. ولا تبيع منتجات ولا تعالج مدفوعات ولا تنشئ حسابًا على هذا الموقع.",
          "أما الدخول والاشتراكات والمدفوعات والشهادات وشروط الخدمة فتخص المنصة التي تختار دخولها (التعليم، المسار المهني، العمل الحر، الأطفال). راجع شروط تلك المنصة قبل الالتزام.",
        ],
      },
    },
    {
      id: "acceptable-use",
      en: {
        heading: "Acceptable use",
        body: [
          "Use the website lawfully. Do not attempt to disrupt it, misuse the enquiry forms to send unlawful, harmful or deceptive content, or submit another person's personal data without a lawful reason.",
          "Do not include passwords, payment card details or sensitive documents in a general enquiry; the enquiry channel is not a secure place for such data.",
        ],
      },
      ar: {
        heading: "الاستخدام المقبول",
        body: [
          "استخدم الموقع بشكل قانوني. ولا تحاول تعطيله، أو إساءة استخدام نماذج الاستفسار لإرسال محتوى غير قانوني أو ضار أو مضلّل، أو إرسال بيانات شخصية لغيرك دون سند قانوني.",
          "ولا تُدرج كلمات المرور أو بيانات بطاقات الدفع أو المستندات الحساسة في استفسار عام؛ فقناة الاستفسار ليست مكانًا آمنًا لمثل هذه البيانات.",
        ],
      },
    },
    {
      id: "enquiries",
      en: {
        heading: "Enquiries and responses",
        body: [
          "Submitting an enquiry does not create a contract or guarantee a specific outcome, price or timeline. We store your enquiry to respond and route it to the right team.",
          "Any pricing shown for a platform offer is indicative and is confirmed on the selling platform before any payment. See the Payment Security and Currency page.",
        ],
      },
      ar: {
        heading: "الاستفسارات والردود",
        body: [
          "إرسال استفسار لا يُنشئ عقدًا ولا يضمن نتيجة أو سعرًا أو إطارًا زمنيًا محددًا. ونحفظ استفسارك للرد عليه وتوجيهه إلى الفريق المناسب.",
          "وأي سعر يُعرض لعرض منصة هو استرشادي ويُؤكَّد على المنصة البائعة قبل أي دفع. راجع صفحة أمان الدفع والعملة.",
        ],
      },
    },
    {
      id: "ip",
      en: {
        heading: "Content and intellectual property",
        body: [
          "The USAM name, brand, and the website's content are protected. You may not copy or reuse them beyond normal browsing without permission. Links to third parties are provided for convenience; we are not responsible for their content.",
        ],
      },
      ar: {
        heading: "المحتوى والملكية الفكرية",
        body: [
          "اسم يوزم وعلامتها ومحتوى الموقع محمية. ولا يجوز نسخها أو إعادة استخدامها خارج التصفح العادي دون إذن. والروابط إلى أطراف ثالثة مُقدَّمة للتسهيل، ولسنا مسؤولين عن محتواها.",
        ],
      },
    },
    {
      id: "liability-law",
      en: {
        heading: "Liability and governing law",
        body: [
          "The website is provided on an \"as available\" basis. To the extent permitted by law, we are not liable for decisions you make after leaving for a platform; those are governed by the platform's terms.",
          "The governing law and the venue for disputes are [FOR REVIEW — governing law and venue, to be confirmed by counsel] and will be stated here before publication. Nothing in these terms removes consumer rights that apply by law.",
        ],
      },
      ar: {
        heading: "المسؤولية والقانون الحاكم",
        body: [
          "يُقدَّم الموقع على أساس «حسب المتاح». وبالقدر الذي يسمح به القانون، لا نتحمّل المسؤولية عن القرارات التي تتخذها بعد مغادرتك إلى منصة؛ فتلك تحكمها شروط المنصة.",
          "والقانون الحاكم وجهة الاختصاص للنزاعات [تتطلب مراجعة قانونية] وستُذكر هنا قبل النشر. ولا شيء في هذه الشروط يلغي حقوق المستهلك المقرّرة قانونًا.",
        ],
      },
    },
  ],
};

const cookies: Policy = {
  type: "cookies",
  path: "/cookies",
  version: BASELINE_VERSION,
  effectiveAt: noEffectiveDate,
  updatedAt: BUILT_AT,
  approval: DRAFT,
  title: { en: "Cookie Policy", ar: "سياسة ملفات الارتباط" },
  scope: {
    en: "The browser storage this website uses. Today it uses only necessary/functional storage — no advertising or third-party analytics.",
    ar: "تخزين المتصفح الذي يستخدمه هذا الموقع. وهو حاليًا يستخدم فقط تخزينًا ضروريًا/وظيفيًا — دون إعلانات أو تحليلات من أطراف ثالثة.",
  },
  appliesTo: {
    en: "usamif.com. Platforms manage their own cookies separately.",
    ar: "موقع usamif.com. وتدير المنصات ملفات الارتباط الخاصة بها بشكل مستقل.",
  },
  audience: "all",
  sections: [
    {
      id: "summary",
      en: {
        heading: "The honest summary",
        body: [
          "This website currently stores only what it needs to work and to remember your choices. We do not use advertising cookies, tracking pixels, or third-party analytics here.",
          "Because there are no optional trackers today, you will not see a banner asking you to accept tracking. Cookie Settings still let you review exactly what is stored and clear functional preferences.",
        ],
      },
      ar: {
        heading: "الخلاصة الصادقة",
        body: [
          "يخزّن هذا الموقع حاليًا ما يلزمه للعمل ولتذكّر اختياراتك فقط. ولا نستخدم ملفات ارتباط إعلانية ولا بكسلات تتبّع ولا تحليلات من أطراف ثالثة هنا.",
          "ولعدم وجود أدوات تتبّع اختيارية اليوم، لن ترى شريطًا يطلب قبول التتبّع. ومع ذلك تتيح لك «إعدادات ملفات الارتباط» مراجعة ما هو مُخزَّن بدقّة ومسح التفضيلات الوظيفية.",
        ],
      },
    },
    {
      id: "necessary",
      en: {
        heading: "Necessary and functional storage",
        body: [
          "Language preference (usam-locale) and theme preference (usam-theme) are stored in your browser's local storage so the site remembers them. They stay on your device and are not sent to an advertising network.",
          "A record of your cookie choice (usam-consent) is also stored so we can honor it and show it in Cookie Settings.",
          "Your Ask USAM message stays in the page's memory to produce a suggestion; it is not saved to a server or sent to an external model.",
        ],
      },
      ar: {
        heading: "التخزين الضروري والوظيفي",
        body: [
          "يُحفظ تفضيل اللغة (usam-locale) وتفضيل المظهر (usam-theme) في التخزين المحلي للمتصفح ليتذكّرهما الموقع. ويظلّان على جهازك ولا يُرسلان إلى شبكة إعلانات.",
          "كما يُحفظ سجلّ اختيارك لملفات الارتباط (usam-consent) حتى نحترمه ونعرضه في الإعدادات.",
          "وتبقى رسالتك في «اسأل يوزم» في ذاكرة الصفحة لإنتاج اقتراح؛ ولا تُحفظ على خادم ولا تُرسل إلى نموذج خارجي.",
        ],
      },
    },
    {
      id: "optional",
      en: {
        heading: "Optional categories (if ever added)",
        body: [
          "If we later add analytics or marketing technologies, they will be off by default and loaded only after you choose to accept them in Cookie Settings. Rejecting optional cookies will never block ordinary use of the site.",
          "You can reopen Cookie Settings any time from the footer and change or withdraw your choice.",
        ],
      },
      ar: {
        heading: "الفئات الاختيارية (إن أُضيفت مستقبلًا)",
        body: [
          "إذا أضفنا لاحقًا تقنيات تحليلات أو تسويق، فستكون متوقفة افتراضيًا ولن تُحمّل إلا بعد اختيارك قبولها في الإعدادات. ورفض الملفات الاختيارية لن يمنع الاستخدام العادي للموقع أبدًا.",
          "ويمكنك إعادة فتح «إعدادات ملفات الارتباط» في أي وقت من التذييل وتغيير اختيارك أو سحبه.",
        ],
      },
    },
    {
      id: "browser-controls",
      en: {
        heading: "Browser controls",
        body: [
          "You can also clear stored site data from your browser's privacy settings. Clearing data resets your language, theme and cookie choice on this site.",
        ],
      },
      ar: {
        heading: "أدوات المتصفح",
        body: [
          "يمكنك أيضًا مسح بيانات الموقع المخزّنة من إعدادات الخصوصية في متصفحك. ويؤدي المسح إلى إعادة ضبط لغتك ومظهرك واختيارك لملفات الارتباط على هذا الموقع.",
        ],
      },
    },
  ],
};

const refunds: Policy = {
  type: "refunds",
  path: "/refunds",
  version: BASELINE_VERSION,
  effectiveAt: noEffectiveDate,
  updatedAt: BUILT_AT,
  approval: DRAFT,
  title: { en: "Refund & Cancellation Policy", ar: "سياسة الاسترداد والإلغاء" },
  scope: {
    en: "Where purchases happen and how refunds and cancellations are handled. The Master website does not take payment; each platform applies its own approved rules.",
    ar: "أين تتم المشتريات وكيف يُعالَج الاسترداد والإلغاء. لا يستقبل الموقع الرئيسي أي دفع؛ وتطبّق كل منصة قواعدها المعتمدة.",
  },
  appliesTo: {
    en: "Guidance that points to the selling platform. Binding refund rules live on each platform.",
    ar: "إرشاد يحيلك إلى المنصة البائعة. أما قواعد الاسترداد المُلزِمة فتوجد على كل منصة.",
  },
  audience: "all",
  sections: [
    {
      id: "where-purchases-happen",
      en: {
        heading: "Where purchases happen",
        body: [
          "You do not buy anything on usamif.com. Payments are made on the relevant platform — Education, Career, Freelancing or Kids — through that platform's checkout and payment provider.",
          "Because of that, the binding refund and cancellation rules are the ones published by the platform where you paid. This page helps you find the right place and understand the general shape of a request.",
        ],
      },
      ar: {
        heading: "أين تتم المشتريات",
        body: [
          "لا تشتري أي شيء على usamif.com. وتتم المدفوعات على المنصة المعنية — التعليم أو المسار المهني أو العمل الحر أو الأطفال — عبر صفحة الدفع ومزوّد الدفع الخاص بتلك المنصة.",
          "ولذلك فإن قواعد الاسترداد والإلغاء المُلزِمة هي التي تنشرها المنصة التي دفعت فيها. وتساعدك هذه الصفحة على الوصول إلى المكان الصحيح وفهم الشكل العام للطلب.",
        ],
      },
    },
    {
      id: "by-offering",
      en: {
        heading: "Rules depend on what you bought",
        body: [
          "Different offerings can have different rules: a subscription, a one-time course or bundle, a professional service or booking, and a freelancing/marketplace transaction are not the same.",
          "The exact eligibility windows, cancellation-versus-refund treatment, and processing timeframes for each offering are set and published by the platform and are [FOR REVIEW — platform refund rules] here. We do not state a universal \"no refunds\" rule or invent a refund period, and applicable consumer rights are preserved.",
        ],
      },
      ar: {
        heading: "القواعد تعتمد على ما اشتريته",
        body: [
          "قد تختلف القواعد باختلاف العرض: فالاشتراك، والدورة أو الحزمة لمرة واحدة، والخدمة المهنية أو الحجز، ومعاملة العمل الحر/السوق ليست واحدة.",
          "ونوافذ الأهلية الدقيقة، ومعاملة الإلغاء مقابل الاسترداد، ومدد المعالجة لكل عرض تحدّدها وتنشرها المنصة و[تتطلب مراجعة قانونية] هنا. ولا نضع قاعدة «لا استرداد» شاملة ولا نخترع مدة استرداد، وتُصان حقوق المستهلك المقررة.",
        ],
      },
    },
    {
      id: "how-to-request",
      en: {
        heading: "How to make a request",
        body: [
          "Start on the platform where you paid and use its refund/cancellation channel. Have your order or transaction reference ready — the platform needs it to locate your payment.",
          "A typical flow is: submit the request with the order reference, the platform reviews eligibility against its policy, and if approved the refund is returned to the original payment method. Timeframes are set by the platform and its payment provider.",
        ],
      },
      ar: {
        heading: "كيف تقدّم طلبًا",
        body: [
          "ابدأ من المنصة التي دفعت فيها واستخدم قناة الاسترداد/الإلغاء بها. وجهّز رقم طلبك أو معاملتك — تحتاجه المنصة لتحديد موقع دفعتك.",
          "والمسار المعتاد: تقديم الطلب مع رقم الطلب، ثم تراجع المنصة الأهلية وفق سياستها، وإذا تمت الموافقة يُعاد الاسترداد إلى وسيلة الدفع الأصلية. وتحدّد المنصة ومزوّد الدفع المدد الزمنية.",
        ],
      },
    },
    {
      id: "central-routing",
      en: {
        heading: "If you contact us here",
        body: [
          "If you send a refund-related enquiry through this website, we will route it to the responsible platform and give you a reference for the enquiry. That reference confirms we received your message — it is not an approval, and it does not complete or confirm any payment or refund. Only the platform can approve a refund.",
        ],
      },
      ar: {
        heading: "إذا تواصلت معنا هنا",
        body: [
          "إذا أرسلت استفسارًا متعلقًا بالاسترداد عبر هذا الموقع، فسنوجّهه إلى المنصة المسؤولة ونمنحك رقمًا مرجعيًا للاستفسار. وهذا الرقم يؤكد استلامنا رسالتك فقط — وليس موافقة، ولا يُكمل أو يؤكد أي دفع أو استرداد. والمنصة وحدها هي من يوافق على الاسترداد.",
        ],
      },
    },
  ],
};

const payments: Policy = {
  type: "payments",
  path: "/payments",
  version: BASELINE_VERSION,
  effectiveAt: noEffectiveDate,
  updatedAt: BUILT_AT,
  approval: DRAFT,
  title: { en: "Payment Security & Currency", ar: "أمان الدفع والعملة" },
  scope: {
    en: "How and where payment happens, and how currency is shown. The Master website never collects card details.",
    ar: "كيف وأين يتم الدفع، وكيف تُعرض العملة. ولا يجمع الموقع الرئيسي بيانات البطاقات مطلقًا.",
  },
  appliesTo: {
    en: "usamif.com (informational). Actual processing happens on the platforms.",
    ar: "موقع usamif.com (معلوماتي). أما المعالجة الفعلية فتتم على المنصات.",
  },
  audience: "all",
  sections: [
    {
      id: "where-payment-happens",
      en: {
        heading: "Payment happens on the platform",
        body: [
          "This website does not have a cart, checkout, card form, or wallet. When an offer involves payment, it is completed on the relevant platform using that platform's configured payment provider.",
          "We do not ask for, receive, or store card numbers, CVV, or bank credentials on usamif.com. Never type payment details into an enquiry form.",
        ],
      },
      ar: {
        heading: "الدفع يتم على المنصة",
        body: [
          "لا يحتوي هذا الموقع على سلة أو صفحة دفع أو نموذج بطاقة أو محفظة. وعندما يتضمّن العرض دفعًا، يُستكمل على المنصة المعنية عبر مزوّد الدفع المُهيّأ لتلك المنصة.",
          "ولا نطلب أرقام البطاقات أو رمز التحقق أو بيانات البنك ولا نستلمها ولا نخزّنها على usamif.com. ولا تُدخل بيانات الدفع في نموذج استفسار أبدًا.",
        ],
      },
    },
    {
      id: "security-on-platforms",
      en: {
        heading: "Security on the selling platform",
        body: [
          "On a selling platform, payment is handled through the provider's hosted checkout or tokenized fields where supported, so card data is handled by the payment provider rather than kept in USAM application logs or support tools.",
          "We do not claim to be \"PCI certified\" or \"100% secure\", and we do not advertise bank partnerships, card-network logos, or 3-D Secure here. Using a hosted payment provider does not by itself establish USAM's own compliance. Any such claim will be published only with evidence and permission, after review. The provider's identity and capabilities are [FOR REVIEW — payment provider, platform-side] on the selling platform.",
        ],
      },
      ar: {
        heading: "الأمان على المنصة البائعة",
        body: [
          "على المنصة البائعة، يُعالَج الدفع عبر صفحة الدفع المُستضافة لدى المزوّد أو الحقول المُرمَّزة حيثما يُتاح، بحيث يتولّى مزوّد الدفع بيانات البطاقة بدلًا من حفظها في سجلات تطبيقات يوزم أو أدوات الدعم.",
          "ولا ندّعي أننا «حاصلون على شهادة PCI» أو «آمنون 100%»، ولا نعلن عن شراكات بنكية أو شعارات شبكات بطاقات أو 3-D Secure هنا. واستخدام مزوّد دفع مُستضاف لا يُثبت بحد ذاته امتثال يوزم. وأي ادّعاء كهذا لن يُنشر إلا بدليل وإذن وبعد مراجعة. وهوية المزوّد وقدراته [تتطلب تهيئة] على المنصة البائعة.",
        ],
      },
    },
    {
      id: "currency",
      en: {
        heading: "Currency and prices",
        body: [
          `The base currency for USAM-owned pricing is the Egyptian Pound (${BASE_CURRENCY}).`,
          "This website does not invent prices. Where a price for a platform offer is shown, it identifies the destination offering and its currency. If a figure in another currency is shown, it is labelled as an estimate (with the exchange-rate source and timestamp) and is not the final charge.",
          "The final charge currency, amount, taxes and fees are shown on the selling platform before you pay. Your card issuer may apply its own currency-conversion charge; that is between you and your issuer.",
        ],
      },
      ar: {
        heading: "العملة والأسعار",
        body: [
          "العملة الأساسية لتسعير يوزم هي الجنيه المصري (EGP).",
          "ولا يخترع هذا الموقع أسعارًا. وحيثما يُعرض سعر لعرض منصة، يوضّح العرض الوجهة وعملته. وإذا عُرض مبلغ بعملة أخرى، فيوسَم كتقدير (مع مصدر سعر الصرف ووقته) وليس المبلغ النهائي.",
          "وتُعرض عملة الخصم النهائية ومبلغه والضرائب والرسوم على المنصة البائعة قبل الدفع. وقد يطبّق مُصدِر بطاقتك رسوم تحويل عملة خاصة به؛ وذلك بينك وبين المُصدِر.",
        ],
      },
    },
    {
      id: "historical",
      en: {
        heading: "Historical transactions",
        body: [
          "Transaction amounts are stored in the actual currency charged. Past transactions in another currency are not relabelled as EGP and marketplace contracts are not silently converted.",
        ],
      },
      ar: {
        heading: "المعاملات السابقة",
        body: [
          "تُخزَّن مبالغ المعاملات بالعملة الفعلية التي خُصمت بها. ولا يُعاد وسم المعاملات السابقة بعملة أخرى على أنها بالجنيه المصري، ولا تُحوَّل عقود السوق بصمت.",
        ],
      },
    },
  ],
};

const aiUse: Policy = {
  type: "ai-use",
  path: "/ai-use",
  version: BASELINE_VERSION,
  effectiveAt: noEffectiveDate,
  updatedAt: BUILT_AT,
  approval: DRAFT,
  title: { en: "AI & Data Use", ar: "الذكاء الاصطناعي واستخدام البيانات" },
  scope: {
    en: "What the Ask USAM guide on this website does with what you type. Platform AI features are disclosed on each platform.",
    ar: "ما يفعله دليل «اسأل يوزم» على هذا الموقع بما تكتبه. أما ميزات الذكاء الاصطناعي في المنصات فتُفصح عنها كل منصة.",
  },
  appliesTo: {
    en: "The Ask USAM guide on usamif.com.",
    ar: "دليل «اسأل يوزم» على usamif.com.",
  },
  audience: "all",
  sections: [
    {
      id: "what-the-guide-is",
      en: {
        heading: "What the Ask USAM guide is",
        body: [
          "Ask USAM on this website is a local goal matcher. It looks at the words you type to suggest which USAM platform fits your goal. It runs in your browser for routing and does not hold a connected conversation with an external AI model from this page.",
          "Your typed message stays in the page's memory to produce the suggestion. It is not saved to a server or sent to a third-party model from here. If you navigate away or close the tab, it is gone.",
        ],
      },
      ar: {
        heading: "ما هو دليل «اسأل يوزم»",
        body: [
          "«اسأل يوزم» على هذا الموقع هو مُطابِق أهداف محلي. ينظر إلى ما تكتبه ليقترح منصة يوزم المناسبة لهدفك. ويعمل في متصفحك لأغراض التوجيه، ولا يُجري محادثة متصلة بنموذج ذكاء اصطناعي خارجي من هذه الصفحة.",
          "وتبقى رسالتك المكتوبة في ذاكرة الصفحة لإنتاج الاقتراح. ولا تُحفظ على خادم ولا تُرسل إلى نموذج خارجي من هنا. وإذا غادرت الصفحة أو أغلقت التبويب، فإنها تزول.",
        ],
      },
    },
    {
      id: "no-automated-decisions",
      en: {
        heading: "No high-impact automated decisions here",
        body: [
          "The guide only suggests a starting point. It does not make account, payment, hiring, or eligibility decisions, and it does not profile you. Treat its suggestion as a starting point and use your own judgment.",
          "If a signal is stored to understand where visitors want to go, it records only the resolved product intent and language — never your raw message.",
        ],
      },
      ar: {
        heading: "لا قرارات آلية عالية الأثر هنا",
        body: [
          "يقترح الدليل نقطة بداية فقط. ولا يتخذ قرارات تتعلق بالحساب أو الدفع أو التوظيف أو الأهلية، ولا يصنّفك. فاعتبر اقتراحه نقطة انطلاق واستخدم تقديرك.",
          "وإذا خُزّنت إشارة لفهم وجهة الزوّار، فإنها تسجّل القصد تجاه المنتج واللغة فقط — ولا تسجّل رسالتك الأصلية أبدًا.",
        ],
      },
    },
    {
      id: "platform-ai",
      en: {
        heading: "AI on the platforms",
        body: [
          "The platforms may offer their own AI features (for example learning or career assistants). Those features, the data they use, their providers, and any human-review controls are described on each platform and are [FOR REVIEW — platform AI disclosures] for cross-platform summary here. A platform AI feature does not make final high-impact decisions without a reviewed, documented safeguard.",
        ],
      },
      ar: {
        heading: "الذكاء الاصطناعي في المنصات",
        body: [
          "قد تقدّم المنصات ميزات ذكاء اصطناعي خاصة بها (مثل مساعدي التعلم أو المسار المهني). وتوصف تلك الميزات والبيانات التي تستخدمها ومزوّدوها وأي ضوابط للمراجعة البشرية على كل منصة و[تتطلب مراجعة قانونية] للتلخيص الموحّد هنا. وميزة الذكاء الاصطناعي في المنصة لا تتخذ قرارات نهائية عالية الأثر دون ضمانة موثّقة ومراجَعة.",
        ],
      },
    },
  ],
};

const privacyRequests: Policy = {
  type: "privacy-requests",
  path: "/privacy-requests",
  version: BASELINE_VERSION,
  effectiveAt: noEffectiveDate,
  updatedAt: BUILT_AT,
  approval: DRAFT,
  title: { en: "Privacy Requests & Contact", ar: "طلبات الخصوصية والتواصل" },
  scope: {
    en: "How to exercise your data rights for information this website holds, and how we verify and handle a request.",
    ar: "كيف تمارس حقوقك على البيانات التي يحتفظ بها هذا الموقع، وكيف نتحقق من الطلب ونعالجه.",
  },
  appliesTo: {
    en: "Data held by usamif.com (your enquiries and choices). Platform data is requested on the platform.",
    ar: "البيانات التي يحتفظ بها usamif.com (استفساراتك واختياراتك). أما بيانات المنصات فتُطلب على المنصة.",
  },
  audience: "all",
  sections: [
    {
      id: "what-you-can-ask",
      en: {
        heading: "What you can ask for",
        body: [
          "Subject to the applicable law, you can ask us to: confirm what enquiry data we hold about you and access it, correct it, delete it, or withdraw an optional consent (such as marketing). You can also ask a general privacy question.",
          "Which rights apply, and any legal exceptions (for example records we must keep), depend on the applicable Egyptian or Saudi framework and are [FOR REVIEW — applicable rights and exceptions, to be confirmed by counsel]. We will tell you how a specific request was handled.",
        ],
      },
      ar: {
        heading: "ما يمكنك طلبه",
        body: [
          "وفقًا للقانون المعمول به، يمكنك أن تطلب منّا: تأكيد بيانات الاستفسار التي نحتفظ بها عنك والاطّلاع عليها، أو تصحيحها، أو حذفها، أو سحب موافقة اختيارية (مثل التسويق). ويمكنك أيضًا طرح سؤال عام عن الخصوصية.",
          "والحقوق المنطبقة وأي استثناءات قانونية (مثل سجلات يلزمنا الاحتفاظ بها) تعتمد على الإطار المصري أو السعودي المعمول به و[تتطلب مراجعة قانونية]. وسنخبرك بكيفية معالجة طلب معيّن.",
        ],
      },
    },
    {
      id: "how-it-works",
      en: {
        heading: "How a request is handled",
        body: [
          "When you submit a request you receive a reference number as a receipt. The request is routed to the responsible staff member for review. The receipt confirms we received your request; it is not confirmation that the requested action has been carried out.",
          "Before we disclose, change or delete any data, we verify your identity. We do not action a deletion or export based on an email address alone, because that would let someone else act on your data. We may ask you to confirm details that match the enquiry. Our full fulfilment procedure and response timeframes are still being finalized and will be stated here before this policy is published.",
        ],
      },
      ar: {
        heading: "كيف يُعالَج الطلب",
        body: [
          "عند تقديم طلب تحصل على رقم مرجعي كإيصال. ويُوجَّه الطلب إلى الموظف المسؤول للمراجعة. ويؤكد الإيصال استلامنا لطلبك؛ وهو ليس تأكيدًا بتنفيذ الإجراء المطلوب.",
          "وقبل الإفصاح عن أي بيانات أو تغييرها أو حذفها، نتحقق من هويتك. ولا ننفّذ حذفًا أو تصديرًا بالاعتماد على البريد الإلكتروني وحده، لأن ذلك قد يتيح لغيرك التصرّف ببياناتك. وقد نطلب منك تأكيد تفاصيل تطابق الاستفسار. وما زال إجراء التنفيذ الكامل والمدد الزمنية قيد الإعداد وستُذكر هنا قبل نشر هذه السياسة.",
        ],
      },
    },
    {
      id: "platform-data",
      en: {
        heading: "Data held by a platform",
        body: [
          "If your request concerns data held by a platform (your account, learning records, applications, payments), make the request on that platform, which operates its own Privacy Center and verification. We can point you to the right place.",
        ],
      },
      ar: {
        heading: "البيانات لدى منصة",
        body: [
          "إذا كان طلبك يخص بيانات لدى منصة (حسابك، سجلات التعلم، الطلبات، المدفوعات)، فقدّم الطلب على تلك المنصة التي تشغّل مركز خصوصية وتحققًا خاصًا بها. ويمكننا إرشادك إلى المكان الصحيح.",
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry + lookup helpers (the single source consumed by pages + the API).
// ---------------------------------------------------------------------------

export const POLICIES: Record<PolicyType, Policy> = {
  privacy,
  terms,
  cookies,
  refunds,
  payments,
  "ai-use": aiUse,
  "privacy-requests": privacyRequests,
};

export const POLICY_TYPES = Object.keys(POLICIES) as PolicyType[];

/** Order shown in the Legal Center index. */
export const LEGAL_CENTER_ORDER: PolicyType[] = [
  "privacy",
  "terms",
  "cookies",
  "refunds",
  "payments",
  "ai-use",
  "privacy-requests",
];

export function getPolicy(type: string): Policy | null {
  return (POLICIES as Record<string, Policy>)[type] ?? null;
}

/** Map a public route path (e.g. "/privacy") to its policy, if any. */
export function policyByPath(path: string): Policy | null {
  const normalized = path.replace(/\/+$/, "") || "/";
  return POLICY_TYPES.map((t) => POLICIES[t]).find((p) => p.path === normalized) ?? null;
}

/** Localized view of a policy for rendering. */
export function localizedPolicy(policy: Policy, locale: Locale) {
  return {
    type: policy.type,
    path: policy.path,
    version: policy.version,
    effectiveAt: policy.effectiveAt,
    updatedAt: policy.updatedAt,
    approval: policy.approval,
    title: policy.title[locale],
    scope: policy.scope[locale],
    appliesTo: policy.appliesTo[locale],
    audience: policy.audience,
    sections: policy.sections.map((s) => ({
      id: s.id,
      heading: s[locale].heading,
      body: s[locale].body,
      pending: s.pending === true,
    })),
  };
}

export type LocalizedPolicy = ReturnType<typeof localizedPolicy>;

/** The user-facing note shown in place of a pending section's unconfirmed body. */
export const PENDING_SECTION_NOTE = {
  en: "This part is being finalized and will be added here once confirmed. It does not change how the website works today.",
  ar: "يجري الانتهاء من هذا الجزء وسيُضاف هنا بعد اعتماده. وهو لا يغيّر طريقة عمل الموقع حاليًا.",
} as const;
