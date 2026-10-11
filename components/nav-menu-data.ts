// Mega-menu content for the desktop navbar.
//
// Every entry here points to a REAL destination that already exists:
//  - internal info pages registered in data/products.ts `routes`
//    (/for-individuals, /for-enterprises, /government, /explore, /ecosystem,
//     /how-it-works, /for-talent, /kids, /pricing, /trust, /faq, /guide, ...)
//  - the four external product domains from data/products.ts `products`
//  - the in-page section anchors that the landing page already renders
//    (#ecosystem, #guidance) — present in components/research-landing.tsx.
//
// No service, feature, or route is invented. Bilingual (EN/AR) labels and
// descriptions are provided; the component picks the active locale.

import {
  Baby,
  Blocks,
  Bot,
  BriefcaseBusiness,
  Building2,
  Compass,
  GraduationCap,
  Landmark,
  Layers,
  Network,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { products } from "@/data/products";

export type MenuLink = {
  href: string;
  /** true => external product domain (opens in new tab). */
  external?: boolean;
  icon: LucideIcon;
  en: { title: string; desc: string };
  ar: { title: string; desc: string };
};

export type MenuSection = {
  /** The nav item this menu belongs to; its top-level anchor target. */
  id: "individuals" | "enterprises" | "government" | "explore" | "ecosystem";
  href: string;
  links: MenuLink[];
};

const domain = (id: string) => products.find((p) => p.id === id)!.domain;

export const NAV_MENUS: MenuSection[] = [
  {
    id: "individuals",
    href: "/for-individuals",
    links: [
      {
        href: domain("education"),
        external: true,
        icon: GraduationCap,
        en: { title: "Learning", desc: "Courses, practice, and learning paths in USAM Education." },
        ar: { title: "التعلّم", desc: "دورات وممارسة ومسارات تعلّم في يوزم للتعليم." },
      },
      {
        href: domain("career"),
        external: true,
        icon: BriefcaseBusiness,
        en: { title: "Career opportunities", desc: "Jobs, CV, and interview preparation in USAM Career." },
        ar: { title: "الفرص المهنية", desc: "وظائف وسيرة ذاتية وتحضير للمقابلات في يوزم للمسار المهني." },
      },
      {
        href: domain("freelancing"),
        external: true,
        icon: Blocks,
        en: { title: "Freelancing", desc: "Offer expertise or find project work in USAM Freelancing." },
        ar: { title: "العمل الحر", desc: "قدّم خبرتك أو اعثر على مشاريع في يوزم للعمل الحر." },
      },
      {
        href: "/kids",
        icon: Baby,
        en: { title: "Kids & Parents", desc: "A guided learning world for ages 7–15." },
        ar: { title: "الأطفال وأولياء الأمور", desc: "عالم تعلّم موجّه للأعمار من ٧ إلى ١٥." },
      },
    ],
  },
  {
    id: "enterprises",
    href: "/for-enterprises",
    links: [
      {
        href: domain("career"),
        external: true,
        icon: BriefcaseBusiness,
        en: { title: "Hiring & talent", desc: "Find candidates and opportunities through USAM Career." },
        ar: { title: "التوظيف والمواهب", desc: "اعثر على المرشحين والفرص عبر يوزم للمسار المهني." },
      },
      {
        href: domain("education"),
        external: true,
        icon: GraduationCap,
        en: { title: "Workforce development", desc: "Build team capability with USAM Education." },
        ar: { title: "تطوير القوى العاملة", desc: "طوّر قدرات فريقك مع يوزم للتعليم." },
      },
      {
        href: domain("freelancing"),
        external: true,
        icon: Blocks,
        en: { title: "Project expertise", desc: "Engage specialists and teams via USAM Freelancing." },
        ar: { title: "خبرات المشاريع", desc: "استعن بالمتخصصين والفرق عبر يوزم للعمل الحر." },
      },
      {
        href: "/for-enterprises",
        icon: Building2,
        en: { title: "Partnerships", desc: "Discuss a scoped enterprise engagement with USAM." },
        ar: { title: "الشراكات", desc: "ناقش تعاونًا مؤسسيًا محدد النطاق مع يوزم." },
      },
    ],
  },
  {
    id: "government",
    href: "/government",
    links: [
      {
        href: "/government",
        icon: Landmark,
        en: { title: "Programs & pathways", desc: "Learning, talent, and youth pathways by partnership scope." },
        ar: { title: "البرامج والمسارات", desc: "مسارات التعلّم والمواهب والشباب ضمن نطاق الشراكة." },
      },
      {
        href: domain("education"),
        external: true,
        icon: GraduationCap,
        en: { title: "Learning initiatives", desc: "Education programs for citizens and students." },
        ar: { title: "مبادرات التعلّم", desc: "برامج تعليمية للمواطنين والطلاب." },
      },
      {
        href: domain("kids"),
        external: true,
        icon: Baby,
        en: { title: "Youth & early discovery", desc: "Age-appropriate learning for younger audiences." },
        ar: { title: "الشباب والاكتشاف المبكّر", desc: "تعلّم مناسب للأعمار الأصغر." },
      },
      {
        href: "/trust",
        icon: ShieldCheck,
        en: { title: "Trust & boundaries", desc: "Privacy, AI limits, and child-safety approach." },
        ar: { title: "الثقة والحدود", desc: "الخصوصية وحدود الذكاء الاصطناعي وسلامة الأطفال." },
      },
    ],
  },
  {
    id: "explore",
    href: "/explore",
    links: [
      {
        href: "/explore",
        icon: Search,
        en: { title: "Discover by goal", desc: "Search products and capabilities by what you want to do." },
        ar: { title: "اكتشف حسب الهدف", desc: "ابحث في المنتجات والقدرات حسب ما تريد إنجازه." },
      },
      {
        href: "/how-it-works",
        icon: Route,
        en: { title: "How USAM works", desc: "Describe a goal, review a starting point, continue in a product." },
        ar: { title: "كيف تعمل يوزم", desc: "صف هدفك، راجع نقطة البداية، ثم أكمل داخل المنتج." },
      },
      {
        href: "/guide",
        icon: Bot,
        en: { title: "Ask USAM guide", desc: "A local goal-matcher that points you to the right platform." },
        ar: { title: "دليل اسأل يوزم", desc: "مطابقة محلية لهدفك توجّهك إلى المنصة المناسبة." },
      },
      {
        href: "/faq",
        icon: Compass,
        en: { title: "FAQ", desc: "Answers about the ecosystem, products, and getting started." },
        ar: { title: "الأسئلة الشائعة", desc: "إجابات عن المنظومة والمنتجات والبدء." },
      },
    ],
  },
  {
    id: "ecosystem",
    href: "/ecosystem",
    links: [
      {
        href: domain("education"),
        external: true,
        icon: GraduationCap,
        en: { title: "Learn — Education", desc: "Build a skill with courses, practice, and paths." },
        ar: { title: "تعلّم — التعليم", desc: "ابنِ مهارة عبر الدورات والممارسة والمسارات." },
      },
      {
        href: domain("career"),
        external: true,
        icon: BriefcaseBusiness,
        en: { title: "Grow — Career", desc: "Prepare and discover opportunities." },
        ar: { title: "تطوّر — المسار المهني", desc: "استعد واكتشف الفرص." },
      },
      {
        href: domain("freelancing"),
        external: true,
        icon: Blocks,
        en: { title: "Earn — Freelancing", desc: "Turn expertise into real project work." },
        ar: { title: "اكسب — العمل الحر", desc: "حوّل خبرتك إلى عمل حقيقي." },
      },
      {
        href: domain("kids"),
        external: true,
        icon: Baby,
        en: { title: "Discover — Kids", desc: "A separate learning journey for children." },
        ar: { title: "اكتشف — الأطفال", desc: "رحلة تعلّم مستقلة للأطفال." },
      },
      {
        href: "/ecosystem",
        icon: Layers,
        en: { title: "The connected journey", desc: "See how Learn → Grow → Earn fits together." },
        ar: { title: "الرحلة المتصلة", desc: "شاهد كيف يتصل: تعلّم ← تطوّر ← اكسب." },
      },
    ],
  },
];

export const MENU_BY_ID = Object.fromEntries(NAV_MENUS.map((m) => [m.id, m])) as Record<
  MenuSection["id"],
  MenuSection
>;

// Icons used by the nav header labels so the component has one source.
export const SECTION_ICONS = {
  individuals: UserRound,
  enterprises: Building2,
  government: Landmark,
  explore: Search,
  ecosystem: Network,
} as const;

export const MENU_UI = {
  en: { more: "Open menu", close: "Close menu", opensNewTab: ", opens in a new tab" },
  ar: { more: "افتح القائمة", close: "أغلق القائمة", opensNewTab: "، يفتح في تبويب جديد" },
} as const;

export { Sparkles };
