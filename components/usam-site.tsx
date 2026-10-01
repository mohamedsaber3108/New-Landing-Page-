"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Baby, Blocks, Bot, BriefcaseBusiness, Building2, CheckCircle2, Globe2, GraduationCap, Info, Landmark, Menu, Moon, Network, Route, Search, Send, ShieldCheck, Sparkles, Sun, UserRound, X } from "lucide-react";
import { ResearchLanding, GuideConnector } from "./research-landing";
import { PageContent } from "./page-content";
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
  privacy: { title: "الخصوصية في يوزم.", label: "قانوني", intro: "هذه الصفحة توصلك إلى معلومات الخصوصية المناسبة لكل منتج." },
  terms: { title: "شروط يوزم.", label: "قانوني", intro: "هذه الصفحة توصلك إلى الشروط والأحكام المناسبة لكل منتج." },
  cookies: { title: "خيارات ملفات الارتباط.", label: "قانوني", intro: "تفصل يوزم وظائف الموقع الضرورية عن اختيارات التحليلات الاختيارية." },
  status: { title: "توافر المنتجات.", label: "الحالة", intro: "يحافظ كل منتج من منتجات يوزم على تجربته وحالته الخاصة." },
};

const focusByPage: Record<string, ProductId[]> = { "for-individuals": ["education", "career", "freelancing"], "for-enterprises": ["freelancing", "career", "education"], government: ["education", "career", "kids"], kids: ["kids"], "for-talent": ["career", "freelancing"], trust: ["kids", "education"], pricing: ["education", "career", "freelancing", "kids"] };

function Mark() { return <span className="brand-logo"><img src="/brand/usam-wordmark.png" width="1000" height="559" alt="USAM" /></span>; }
function ProductLink({ product, locale, compact = false }: { product: Product; locale: Locale; compact?: boolean }) { return <a className={compact ? "product-link compact" : "product-link"} href={trustedDomain(product.domain)} target="_blank" rel="noreferrer">{locale === "ar" ? product.arabicCta : product.cta}</a>; }

function Nav({ locale, setLocale, theme, setTheme, onGuide }: { locale: Locale; setLocale: (value: Locale) => void; theme: "light" | "dark"; setTheme: (value: "light" | "dark") => void; onGuide: () => void }) {
  const [open, setOpen] = useState(false); const t = copy[locale];
  useEffect(() => { const close = (event: KeyboardEvent) => { if(event.key === "Escape") setOpen(false); }; window.addEventListener("keydown",close); return () => window.removeEventListener("keydown",close); }, []);
  const navItems = [{ label: t.individuals, href: "/for-individuals", icon: UserRound }, { label: t.enterprises, href: "/for-enterprises", icon: Building2 }, { label: t.government, href: "/government", icon: Landmark }, { label: t.explore, href: "/explore", icon: Search }, { label: t.ecosystem, href: "/ecosystem", icon: Network }];
  const productsMenu = [{ id: "education", icon: GraduationCap }, { id: "career", icon: BriefcaseBusiness }, { id: "freelancing", icon: Blocks }, { id: "kids", icon: Baby }] as const;
  return <><a className="skip-link" href="#main-content">{locale === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}</a><header className="site-header section-shell"><Link href="/" className="brand" aria-label="USAM home"><Mark /></Link><nav className="desktop-nav" aria-label="Main navigation">{navItems.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href}><Icon size={15} /><span>{item.label}</span></Link>; })}</nav><div className="nav-actions"><button className="guide-trigger" onClick={onGuide}><Sparkles size={16} />{t.ask}</button><button className="locale-button" onClick={() => setLocale(locale === "en" ? "ar" : "en")}><Globe2 size={16} />{t.language}</button><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? t.dark : t.light}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button><button className="menu-button" onClick={() => setOpen(!open)} aria-label={locale === "ar" ? "قائمة التنقل" : "Navigation menu"} aria-expanded={open}>{open ? <X /> : <Menu />}</button></div>{open && <nav className="mobile-nav" aria-label={locale === "ar" ? "التنقل على الهاتف" : "Mobile navigation"}>{[...navItems, { label: locale === "ar" ? "الأطفال وأولياء الأمور" : "Kids & Parents", href: "/kids", icon: Baby }, { label: locale === "ar" ? "عن يوزم" : "About", href: "/about", icon: Info }, { label: t.how, href: "/how-it-works", icon: Route }].map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)}><span><Icon size={17} />{item.label}</span></Link>; })}</nav>}</header><nav className="discovery-strip" aria-label="Product destinations"><div className="section-shell">{productsMenu.map(({ id, icon: Icon }) => { const product = products.find((item) => item.id === id)!; return <a href={trustedDomain(product.domain)} target="_blank" rel="noreferrer" key={id}><Icon size={15} /><span>{locale === "ar" ? product.arabicName : product.name}</span></a>; })}<button onClick={onGuide}><Bot size={15} />{locale === "ar" ? "لا تعرف من أين تبدأ؟" : "Not sure where to start?"}</button></div></nav></>;
}

function Home({ locale, onGuide }: { locale: Locale; onGuide: () => void }) { const isArabic = locale === "ar"; return <ResearchLanding locale={locale} onGuide={onGuide} hero={<section className="hero-reframe section-shell"><div className="hero-intro"><span className="hero-kicker"><i />{isArabic ? "البوابة الذكية لمنظومة يوزم" : "THE INTELLIGENT FRONT DOOR"}</span><h1>{isArabic ? <>ابدأ بهدفك.<br /><em>واترك الباقي</em><br />يوضح الطريق.</> : <>Start with your goal.<br /><em>Let the system</em><br />clarify the path.</>}</h1><p>{isArabic ? "يوزم تربط بين التعلّم والمسار المهني والعمل الحر واكتشاف الأطفال. صف ما تحاول تحقيقه، ثم انتقل مباشرة إلى التجربة المناسبة." : "USAM connects learning, career growth, independent work, and early discovery. Describe what you are trying to achieve and move directly to the right experience."}</p><div className="hero-actions"><button className="primary-button" onClick={onGuide}><Sparkles size={18} />{isArabic ? "صف حالتك" : "Describe your situation"}</button><a className="quiet-button" href="#ecosystem">{isArabic ? "شاهد كيف تتصل المنظومة" : "See how the ecosystem connects"}</a></div></div><div className="hero-route-card"><div className="route-card-head"><span>{isArabic ? "كيف تبدأ" : "HOW YOU START"}</span><b>{isArabic ? "من هدف إلى خطوة" : "From goal to next step"}</b></div><div className="route-lanes"><div><span>01</span><strong>{isArabic ? "صف ما تحتاجه" : "Describe what you need"}</strong><p>{isArabic ? "بكلماتك، لا باسم منتج." : "In your own words, not by product name."}</p></div><div><span>02</span><strong>{isArabic ? "اكتشف التجربة المناسبة" : "Discover the right experience"}</strong><p>{isArabic ? "تعليم، مسار مهني، عمل حر، أو أطفال." : "Education, career, freelancing, or kids."}</p></div><div><span>03</span><strong>{isArabic ? "اتخذ الخطوة التالية" : "Take the next step"}</strong><p>{isArabic ? "بدليل متخصص داخل المنتج." : "With a specialist guide inside the product."}</p></div></div></div></section>} />; }

function InfoPage({ slug, locale, onGuide }: { slug: string; locale: Locale; onGuide: () => void }) {
 const detail = locale === "ar" ? arabicRoutes[slug] : routes[slug];
 if (!detail) return null;
 return <main id="main-content" className="page-experience section-shell"><section className="page-hero"><span>{detail.label}</span><h1>{detail.title}</h1><p>{detail.intro}</p></section><PageContent slug={slug} locale={locale} onGuide={onGuide} /></main>;
}

function Footer({ locale }: { locale: Locale }) { const isArabic = locale === "ar"; return <footer className="site-footer section-shell"><div><Mark /><p>{isArabic ? "تعلم · تطوّر · أنجز · اكتشف" : "Learn · Grow · Work · Discover"}</p></div><div><span>{isArabic ? "استكشف" : "Explore"}</span><Link href="/for-individuals">{copy[locale].individuals}</Link><Link href="/for-enterprises">{copy[locale].enterprises}</Link><Link href="/government">{copy[locale].government}</Link><Link href="/kids">{isArabic ? "الأطفال وأولياء الأمور" : "Kids & Parents"}</Link></div><div><span>{copy[locale].products}</span>{products.map((product) => <a key={product.id} href={trustedDomain(product.domain)} target="_blank" rel="noreferrer">{isArabic ? product.arabicName : product.name}</a>)}</div><div><span>USAM</span><Link href="/about">{isArabic ? "عن يوزم" : "About"}</Link><Link href="/trust">{isArabic ? "الثقة" : "Trust"}</Link><Link href="/faq">{isArabic ? "الأسئلة الشائعة" : "FAQ"}</Link><Link href="/contact">{isArabic ? "تواصل" : "Contact"}</Link></div><nav className="footer-utility" aria-label={isArabic ? "روابط إضافية" : "Additional information"}>{[{href:"/how-it-works",en:"How it works",ar:"كيف تعمل يوزم"},{href:"/pricing",en:"Pricing",ar:"الأسعار"},{href:"/guide",en:"Guide",ar:"الدليل"},{href:"/privacy",en:"Privacy",ar:"الخصوصية"},{href:"/terms",en:"Terms",ar:"الشروط"},{href:"/cookies",en:"Preferences",ar:"التفضيلات"},{href:"/status",en:"Status",ar:"حالة الخدمات"}].map(l=><Link key={l.href} href={l.href}>{isArabic?l.ar:l.en}</Link>)}</nav><small>{isArabic ? "© 2026 يوزم. منظومة واحدة مترابطة." : "© 2026 USAM. One connected ecosystem."}</small></footer>; }

export function USAMSite({ kind = "home", slug }: { kind?: RouteKind; slug?: string }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready,setReady] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    try { const language=localStorage.getItem("usam-locale"); const mode=localStorage.getItem("usam-theme"); if(language==="ar"||language==="en")setLocale(language); if(mode==="dark"||mode==="light")setTheme(mode); } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    document.documentElement.lang=locale; document.documentElement.dir=locale==="ar"?"rtl":"ltr"; document.documentElement.style.colorScheme=theme;
    if(ready)try { localStorage.setItem("usam-locale",locale);localStorage.setItem("usam-theme",theme); } catch {}
  }, [locale,theme,ready]);
  return <div className={`usam-app theme-${theme} locale-${locale}`} dir={locale === "ar" ? "rtl" : "ltr"}><Nav locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} onGuide={() => setGuideOpen(true)} />{kind === "home" ? <Home locale={locale} onGuide={() => setGuideOpen(true)} /> : <InfoPage slug={slug ?? "explore"} locale={locale} onGuide={() => setGuideOpen(true)} />}<Footer locale={locale} /><GuideConnector theme={theme} locale={locale} open={guideOpen} setOpen={setGuideOpen} /></div>;
}
