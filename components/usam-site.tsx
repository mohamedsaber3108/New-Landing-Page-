"use client";

// Primary navigation uses plain <a> anchors (see components/nav-link.tsx) so
// links always navigate even if client hydration is incomplete.
import Link from "./nav-link";
import { useEffect, useRef, useState } from "react";

import { ArrowLeft, ArrowRight, ArrowUpRight, Baby, Blocks, Bot, BriefcaseBusiness, Building2, CheckCircle2, Globe2, GraduationCap, Info, Landmark, Menu, Moon, Network, Route, Search, Send, ShieldCheck, Sparkles, Sun, UserRound, X } from "lucide-react";
import { ResearchLanding, GuideConnector } from "./research-landing";
import { PageContent } from "./page-content";
import { NavMenu, MobileNavSection } from "./nav-menu";
import { CookieConsent, CookieSettingsModal, openCookieSettings } from "./cookie-consent";
import { products, routes, type Product, type ProductId, trustedDomain } from "@/data/products";

type RouteKind = "home" | "info";
type Locale = "en" | "ar";

const copy = {
  en: { individuals: "Individuals", enterprises: "Enterprises", government: "Government", explore: "Explore", ecosystem: "Ecosystem", how: "How it works", ask: "Ask USAM", language: "العربية", dark: "Use dark mode", light: "Use light mode", products: "Products", close: "Close" },
  ar: { individuals: "الأفراد", enterprises: "المؤسسات", government: "الجهات الحكومية", explore: "استكشف", ecosystem: "المنظومة", how: "كيف تعمل يوزم", ask: "اسأل يوزم", language: "English", dark: "تفعيل الوضع الداكن", light: "تفعيل الوضع الفاتح", products: "المنتجات", close: "إغلاق" },
} as const;

const arabicRoutes: Record<string, { title: string; label: string; intro: string }> = {
  about: { title: "منظومة تُبنى حول تقدّمك.", label: "عن يوزم", intro: "تجمع يوزم التعلم والمسار المهني والعمل واكتشاف الأطفال في مسارات واضحة ومتصلة." },
  ecosystem: { title: "منتجات متخصصة، ومسار واحد متصل.", label: "المنظومة", intro: "لكل منتج دوره، لكن الانتقال بينها يبدأ من هدفك وليس من أسماء المنصات." },
  explore: { title: "اكتشف حسب ما تريد إنجازه.", label: "استكشف", intro: "اختر النتيجة التي تهمك وسنقودك إلى التجربة الأقرب لها." },
  "how-it-works": { title: "هدفك يحدد البداية.", label: "كيف تعمل يوزم", intro: "صف ما تحاول تحقيقه، ثم انتقل إلى المنتج والدليل المناسبين للخطوة التالية." },
  "for-individuals": { title: "خطوتك التالية تبدأ هنا.", label: "للأفراد", intro: "تعلّم، واستعد للكارير، واعثر على فرص أو عمل مستقل من نقطة بداية واحدة." },
  "for-enterprises": { title: "اربط القدرة بالنتيجة.", label: "للمؤسسات", intro: "استكشف مسارات المواهب والتعلم والمشروعات المناسبة لاحتياج مؤسستك." },
  government: { title: "استكشف مسارًا مؤسسيًا مناسبًا.", label: "للجهات الحكومية", intro: "تُبنى مسارات التعلم والمواهب والابتكار ضمن نطاق الشراكة المؤكد مع الجهة." },
  "for-talent": { title: "حوّل خبرتك إلى تقدّم.", label: "للمواهب", intro: "ابنِ دليلاً على عملك، واكتشف الفرص، وطوّر مسارك المستقل." },
  kids: { title: "امنح الفضول مكانًا ينطلق إليه.", label: "الأطفال وأولياء الأمور", intro: "عالم تعلم موجّه يتيح للأطفال الاستكشاف والإبداع والبرمجة وبناء الثقة." },
  pricing: { title: "الخطط تعيش داخل المنتجات.", label: "الأسعار", intro: "تساعدك يوزم الرئيسية في الوصول إلى المنتج الذي يضم الخطة المناسبة." },
  contact: { title: "ابدأ حوارًا مع يوزم.", label: "تواصل", intro: "للأسئلة العامة أو الشراكات أو احتياجات المؤسسات، ابدأ بوصف ما تريد تحقيقه." },
  trust: { title: "حدود واضحة، وتجربة مسؤولة.", label: "الثقة", intro: "تعرّف على نهج يوزم تجاه الخصوصية والذكاء الاصطناعي وحدود المنتجات وسلامة الأطفال." },
  faq: { title: "إجابات واضحة قبل أن تبدأ.", label: "الأسئلة الشائعة", intro: "أسئلة عن المنظومة والمنتجات وأدلة الذكاء الاصطناعي والحسابات." },
  guide: { title: "أخبر يوزم بما تريد تحقيقه.", label: "دليل يوزم", intro: "الدليل يحدد أفضل نقطة دخول، ثم يكمل معك الدليل المتخصص داخل المنتج المناسب." },
  legal: { title: "مركز يوزم القانوني.", label: "المركز القانوني", intro: "كل سياسات موقع يوزم الرئيسي في مكان واحد، مع النطاق والإصدار وتاريخ السريان. أما شروط كل منصة فتوجد على المنصة نفسها." },
  privacy: { title: "سياسة الخصوصية.", label: "قانوني", intro: "كيف يتعامل موقع يوزم الرئيسي مع معلوماتك." },
  terms: { title: "شروط الاستخدام.", label: "قانوني", intro: "قواعد استخدام موقع يوزم الرئيسي. أما الشراء والحسابات فتتم على المنصات." },
  cookies: { title: "سياسة ملفات الارتباط والإعدادات.", label: "قانوني", intro: "تخزين المتصفح الذي يستخدمه هذا الموقع، وأدوات لمراجعته أو تغييره." },
  refunds: { title: "سياسة الاسترداد والإلغاء.", label: "قانوني", intro: "أين تتم المشتريات وكيف يُعالَج الاسترداد والإلغاء على المنصات." },
  payments: { title: "أمان الدفع والعملة.", label: "قانوني", intro: "كيف وأين يتم الدفع، وكيف تُعرض العملة والأسعار." },
  "ai-use": { title: "الذكاء الاصطناعي واستخدام البيانات.", label: "قانوني", intro: "ما يفعله دليل «اسأل يوزم» بما تكتبه، وكيف يُفصح عن الذكاء الاصطناعي في المنصات." },
  "privacy-requests": { title: "طلبات الخصوصية والتواصل.", label: "قانوني", intro: "مارس حقوقك على البيانات التي يحتفظ بها هذا الموقع، مع التحقق من الهوية." },
  status: { title: "توافر المنتجات.", label: "الحالة", intro: "يحافظ كل منتج من منتجات يوزم على تجربته وحالته الخاصة." },
  sitemap: { title: "خريطة الموقع.", label: "خريطة الموقع", intro: "دليل مقروء لكل صفحات موقع يوزم الرئيسي، مُجمّعة حسب القسم." },
};

const focusByPage: Record<string, ProductId[]> = { "for-individuals": ["education", "career", "freelancing"], "for-enterprises": ["freelancing", "career", "education"], government: ["education", "career", "kids"], kids: ["kids"], "for-talent": ["career", "freelancing"], trust: ["kids", "education"], pricing: ["education", "career", "freelancing", "kids"] };

function Mark() { return <span className="brand-logo"><img src="/brand/usam-wordmark.png" width="1000" height="559" alt="USAM" /></span>; }
function ProductLink({ product, locale, compact = false }: { product: Product; locale: Locale; compact?: boolean }) { return <a className={compact ? "product-link compact" : "product-link"} href={trustedDomain(product.domain)} target="_blank" rel="noreferrer">{locale === "ar" ? product.arabicCta : product.cta}</a>; }

type SectionId = "individuals" | "enterprises" | "government" | "explore" | "ecosystem";

function Nav({ locale, setLocale, theme, setTheme, onGuide }: { locale: Locale; setLocale: (value: Locale) => void; theme: "light" | "dark"; setTheme: (value: "light" | "dark") => void; onGuide: () => void }) {
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null); // desktop mega-menu
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const t = copy[locale];
  const headerRef = useRef<HTMLElement>(null);

  // Enable hover-to-open only on devices with a real hover-capable pointer.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      setHoverEnabled(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    }
  }, []);

  // Close the mobile menu on Escape; close the desktop mega-menu on Escape too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setOpenMenu(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the desktop mega-menu on outside click / focus leaving the header.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => { if (!headerRef.current?.contains(e.target as Node)) setOpenMenu(null); };
    const onFocus = (e: FocusEvent) => { if (!headerRef.current?.contains(e.target as Node)) setOpenMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("focusin", onFocus);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("focusin", onFocus); };
  }, [openMenu]);

  const navItems: { id: SectionId; label: string }[] = [
    { id: "individuals", label: t.individuals },
    { id: "enterprises", label: t.enterprises },
    { id: "government", label: t.government },
    { id: "explore", label: t.explore },
    { id: "ecosystem", label: t.ecosystem },
  ];
  const productsMenu = [{ id: "education", icon: GraduationCap }, { id: "career", icon: BriefcaseBusiness }, { id: "freelancing", icon: Blocks }, { id: "kids", icon: Baby }] as const;
  const closeMobile = () => { setOpen(false); setMobileExpanded(null); };

  return <><a className="skip-link" href="#main-content">{locale === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}</a><header ref={headerRef} className="site-header section-shell" onMouseLeave={() => setOpenMenu(null)}><Link href="/" className="brand" aria-label="USAM home"><Mark /></Link><nav className="desktop-nav" aria-label="Main navigation">{navItems.map((item) => <NavMenu key={item.id} section={item.id} label={item.label} locale={locale} openId={openMenu} setOpenId={setOpenMenu} hoverEnabled={hoverEnabled} />)}</nav><div className="nav-actions"><button className="guide-trigger" onClick={onGuide}><Sparkles size={16} />{t.ask}</button><button className="locale-button" onClick={() => setLocale(locale === "en" ? "ar" : "en")}><Globe2 size={16} />{t.language}</button><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? t.dark : t.light}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button><button className="menu-button" onClick={() => setOpen(!open)} aria-label={locale === "ar" ? "قائمة التنقل" : "Navigation menu"} aria-expanded={open}>{open ? <X /> : <Menu />}</button></div>{open && <nav className="mobile-nav" aria-label={locale === "ar" ? "التنقل على الهاتف" : "Mobile navigation"}>{navItems.map((item) => <MobileNavSection key={item.id} section={item.id} label={item.label} locale={locale} expanded={mobileExpanded === item.id} setExpanded={setMobileExpanded} onNavigate={closeMobile} />)}<div className="mobile-nav-extra">{[{ label: locale === "ar" ? "الأطفال وأولياء الأمور" : "Kids & Parents", href: "/kids", icon: Baby }, { label: locale === "ar" ? "عن يوزم" : "About", href: "/about", icon: Info }, { label: t.how, href: "/how-it-works", icon: Route }].map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={closeMobile}><span><Icon size={17} />{item.label}</span></Link>; })}</div></nav>}</header><nav className="discovery-strip" aria-label="Product destinations"><div className="section-shell">{productsMenu.map(({ id, icon: Icon }) => { const product = products.find((item) => item.id === id)!; return <a href={trustedDomain(product.domain)} target="_blank" rel="noreferrer" key={id}><Icon size={15} /><span>{locale === "ar" ? product.arabicName : product.name}</span></a>; })}<button onClick={onGuide}><Bot size={15} />{locale === "ar" ? "لا تعرف من أين تبدأ؟" : "Not sure where to start?"}</button></div></nav></>;
}

function Home({ locale, onGuide }: { locale: Locale; onGuide: () => void }) { const isArabic = locale === "ar"; return <ResearchLanding locale={locale} onGuide={onGuide} hero={<section className="hero-reframe section-shell"><div className="hero-intro"><span className="hero-kicker"><i />{isArabic ? "البوابة الذكية لمنظومة يوزم" : "THE INTELLIGENT FRONT DOOR"}</span><h1>{isArabic ? <>ابدأ بهدفك.<br /><em>واترك الباقي</em><br />يوضح الطريق.</> : <>Start with your goal.<br /><em>Let the system</em><br />clarify the path.</>}</h1><p>{isArabic ? "يوزم تربط بين التعلّم والمسار المهني والعمل الحر واكتشاف الأطفال. صف ما تحاول تحقيقه، ثم انتقل مباشرة إلى التجربة المناسبة." : "USAM connects learning, career growth, independent work, and early discovery. Describe what you are trying to achieve and move directly to the right experience."}</p><div className="hero-actions"><button className="primary-button" onClick={onGuide}><Sparkles size={18} />{isArabic ? "صف حالتك" : "Describe your situation"}</button><a className="quiet-button" href="#ecosystem">{isArabic ? "شاهد كيف تتصل المنظومة" : "See how the ecosystem connects"}</a></div></div><div className="hero-route-card"><div className="route-card-head"><span>{isArabic ? "كيف تبدأ" : "HOW YOU START"}</span><b>{isArabic ? "من هدف إلى خطوة" : "From goal to next step"}</b></div><div className="route-lanes"><div><span>01</span><strong>{isArabic ? "صف ما تحتاجه" : "Describe what you need"}</strong><p>{isArabic ? "بكلماتك، لا باسم منتج." : "In your own words, not by product name."}</p></div><div><span>02</span><strong>{isArabic ? "اكتشف التجربة المناسبة" : "Discover the right experience"}</strong><p>{isArabic ? "تعليم، مسار مهني، عمل حر، أو أطفال." : "Education, career, freelancing, or kids."}</p></div><div><span>03</span><strong>{isArabic ? "اتخذ الخطوة التالية" : "Take the next step"}</strong><p>{isArabic ? "بدليل متخصص داخل المنتج." : "With a specialist guide inside the product."}</p></div></div></div></section>} />; }

function InfoPage({ slug, locale, onGuide }: { slug: string; locale: Locale; onGuide: () => void }) {
 const detail = locale === "ar" ? arabicRoutes[slug] : routes[slug];
 if (!detail) return null;
 return <main id="main-content" className="page-experience section-shell"><section className="page-hero"><span>{detail.label}</span><h1>{detail.title}</h1><p>{detail.intro}</p></section><PageContent slug={slug} locale={locale} onGuide={onGuide} /></main>;
}

function Footer({ locale }: { locale: Locale }) {
  const isArabic = locale === "ar";
  // All eight legal destinations live together under one "Legal & Privacy"
  // group — including AI & Data Use and Privacy Requests (previously in the
  // separate utility row).
  const legalLinks = [
    { href: "/legal", en: "Legal Center", ar: "المركز القانوني" },
    { href: "/privacy", en: "Privacy Policy", ar: "سياسة الخصوصية" },
    { href: "/terms", en: "Terms of Use", ar: "شروط الاستخدام" },
    { href: "/cookies", en: "Cookie Policy", ar: "سياسة ملفات الارتباط" },
    { href: "/refunds", en: "Refunds & Cancellations", ar: "الاسترداد والإلغاء" },
    { href: "/payments", en: "Payment Security", ar: "أمان الدفع" },
    { href: "/ai-use", en: "AI & Data Use", ar: "الذكاء الاصطناعي والبيانات" },
    { href: "/privacy-requests", en: "Privacy Requests", ar: "طلبات الخصوصية" },
  ];
  return <footer className="site-footer section-shell"><div><Mark /><p>{isArabic ? "تعلم · تطوّر · أنجز · اكتشف" : "Learn · Grow · Work · Discover"}</p></div><div><span>{isArabic ? "استكشف" : "Explore"}</span><Link href="/for-individuals">{copy[locale].individuals}</Link><Link href="/for-enterprises">{copy[locale].enterprises}</Link><Link href="/government">{copy[locale].government}</Link><Link href="/kids">{isArabic ? "الأطفال وأولياء الأمور" : "Kids & Parents"}</Link></div><div><span>{copy[locale].products}</span>{products.map((product) => <a key={product.id} href={trustedDomain(product.domain)} target="_blank" rel="noreferrer">{isArabic ? product.arabicName : product.name}</a>)}</div><div><span>USAM</span><Link href="/about">{isArabic ? "عن يوزم" : "About"}</Link><Link href="/trust">{isArabic ? "الثقة" : "Trust"}</Link><Link href="/faq">{isArabic ? "الأسئلة الشائعة" : "FAQ"}</Link><Link href="/contact">{isArabic ? "تواصل" : "Contact"}</Link></div><div className="footer-legal"><span>{isArabic ? "القانون والخصوصية" : "Legal & Privacy"}</span>{legalLinks.map((l) => <Link key={l.href} href={l.href}>{isArabic ? l.ar : l.en}</Link>)}<button type="button" className="footer-cookie-btn" onClick={() => openCookieSettings()}>{isArabic ? "إعدادات ملفات الارتباط" : "Cookie Settings"}</button></div><nav className="footer-utility" aria-label={isArabic ? "روابط إضافية" : "Additional information"}>{[{href:"/how-it-works",en:"How it works",ar:"كيف تعمل يوزم"},{href:"/pricing",en:"Pricing",ar:"الأسعار"},{href:"/guide",en:"Guide",ar:"الدليل"},{href:"/status",en:"Status",ar:"حالة الخدمات"},{href:"/privacy-requests",en:"Your Privacy Choices",ar:"اختيارات الخصوصية"},{href:"/sitemap",en:"Sitemap",ar:"خريطة الموقع"}].map(l=><Link key={l.href} href={l.href}>{isArabic?l.ar:l.en}</Link>)}</nav><small>{isArabic ? "© 2026 يوزم. منظومة واحدة مترابطة." : "© 2026 USAM. One connected ecosystem."}</small></footer>;
}

export function USAMSite({ kind = "home", slug }: { kind?: RouteKind; slug?: string }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready,setReady] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // Only persist language/theme once the user has actually chosen one. Writing
  // defaults for a visitor who never chose would (a) create storage with no
  // consent and (b) re-create the keys immediately after "Reset saved
  // preferences", so a reset would not survive a reload. A real toggle flips
  // this ref via the wrapped setters below.
  const userChose = useRef(false);
  useEffect(() => {
    try { const language=localStorage.getItem("usam-locale"); const mode=localStorage.getItem("usam-theme"); if(language==="ar"||language==="en"){setLocale(language);userChose.current=true;} if(mode==="dark"||mode==="light"){setTheme(mode);userChose.current=true;} } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    // Always reflect the current locale/theme in the document (not persisted).
    document.documentElement.lang=locale; document.documentElement.dir=locale==="ar"?"rtl":"ltr"; document.documentElement.style.colorScheme=theme;
    // Persist ONLY when the user has made an explicit choice this/!prior session.
    if(ready && userChose.current)try { localStorage.setItem("usam-locale",locale);localStorage.setItem("usam-theme",theme); } catch {}
  }, [locale,theme,ready]);
  const chooseLocale = (value: Locale) => { userChose.current = true; setLocale(value); };
  const chooseTheme = (value: "light" | "dark") => { userChose.current = true; setTheme(value); };
  return <div className={`usam-app theme-${theme} locale-${locale}`} dir={locale === "ar" ? "rtl" : "ltr"}><Nav locale={locale} setLocale={chooseLocale} theme={theme} setTheme={chooseTheme} onGuide={() => setGuideOpen(true)} />{kind === "home" ? <Home locale={locale} onGuide={() => setGuideOpen(true)} /> : <InfoPage slug={slug ?? "explore"} locale={locale} onGuide={() => setGuideOpen(true)} />}<Footer locale={locale} /><GuideConnector theme={theme} locale={locale} open={guideOpen} setOpen={setGuideOpen} /><CookieConsent locale={locale} /><CookieSettingsModal locale={locale} /></div>;
}
