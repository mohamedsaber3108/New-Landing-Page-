"use client";

// Primary navigation uses plain <a> anchors (see components/nav-link.tsx) so
// links always navigate even if client hydration is incomplete.
import Link from "./nav-link";
import { ContactInfo } from "./contact-info";
import { persistPreferences } from "@/lib/locale";
import { siteCopy, type LinkCopy } from "@/lib/copy";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Baby, Blocks, Bot, BriefcaseBusiness, Globe2, GraduationCap, Info, Menu, Moon, Route, Sparkles, Sun, X } from "lucide-react";
import { ResearchLanding, GuideConnector } from "./research-landing";
import { PageContent } from "./page-content";
import { NavMenu, MobileNavSection } from "./nav-menu";
import { CookieConsent, CookieSettingsModal, openCookieSettings } from "./cookie-consent";
import { products, type Product, type ProductId, trustedDomain } from "@/data/products";

type RouteKind = "home" | "info";
type Locale = "en" | "ar";

// All visible copy lives in lib/copy/en.ts and lib/copy/ar.ts (one typed shape).

const focusByPage: Record<string, ProductId[]> = { "for-individuals": ["education", "career", "freelancing"], "for-enterprises": ["freelancing", "career", "education"], government: ["education", "career", "kids"], kids: ["kids"], "for-talent": ["career", "freelancing"], trust: ["kids", "education"], pricing: ["education", "career", "freelancing", "kids"] };

function Mark() { return <span className="brand-logo"><img src="/brand/usam-wordmark.png" width="1000" height="559" alt="USAM" /></span>; }
function ProductLink({ product, locale, compact = false }: { product: Product; locale: Locale; compact?: boolean }) { return <a className={compact ? "product-link compact" : "product-link"} href={trustedDomain(product.domain)} target="_blank" rel="noreferrer">{locale === "ar" ? product.arabicCta : product.cta}</a>; }

type SectionId = "individuals" | "enterprises" | "government" | "explore" | "ecosystem";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
function readHover(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(HOVER_QUERY).matches;
}
function subscribeHover(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(HOVER_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

function Nav({ locale, setLocale, theme, setTheme, onGuide }: { locale: Locale; setLocale: (value: Locale) => void; theme: "light" | "dark"; setTheme: (value: "light" | "dark") => void; onGuide: () => void }) {
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null); // desktop mega-menu
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  // Enable hover-to-open only on devices with a real hover-capable pointer.
  // Server render and hydration use false, then the client value, as before.
  const hoverEnabled = useSyncExternalStore(subscribeHover, readHover, () => false);
  const t = siteCopy[locale].nav;
  const headerRef = useRef<HTMLElement>(null);

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

  return <><a className="skip-link" href="#main-content">{t.skipToContent}</a><header ref={headerRef} className="site-header section-shell" onMouseLeave={() => setOpenMenu(null)}><Link href="/" className="brand" aria-label="USAM home"><Mark /></Link><nav className="desktop-nav" aria-label="Main navigation">{navItems.map((item) => <NavMenu key={item.id} section={item.id} label={item.label} locale={locale} openId={openMenu} setOpenId={setOpenMenu} hoverEnabled={hoverEnabled} />)}</nav><div className="nav-actions"><button className="guide-trigger" onClick={onGuide}><Sparkles size={16} />{t.ask}</button><button className="locale-button" onClick={() => setLocale(locale === "en" ? "ar" : "en")}><Globe2 size={16} />{t.language}</button><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? t.dark : t.light}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button><button className="menu-button" onClick={() => setOpen(!open)} aria-label={t.navigationMenu} aria-expanded={open}>{open ? <X /> : <Menu />}</button></div>{open && <nav className="mobile-nav" aria-label={t.mobileNavigation}>{navItems.map((item) => <MobileNavSection key={item.id} section={item.id} label={item.label} locale={locale} expanded={mobileExpanded === item.id} setExpanded={setMobileExpanded} onNavigate={closeMobile} />)}<div className="mobile-nav-extra">{[{ label: t.kidsParents, href: "/kids", icon: Baby }, { label: t.about, href: "/about", icon: Info }, { label: t.how, href: "/how-it-works", icon: Route }].map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={closeMobile}><span><Icon size={17} />{item.label}</span></Link>; })}</div></nav>}</header><nav className="discovery-strip" aria-label="Product destinations"><div className="section-shell">{productsMenu.map(({ id, icon: Icon }) => { const product = products.find((item) => item.id === id)!; return <a href={trustedDomain(product.domain)} target="_blank" rel="noreferrer" key={id}><Icon size={15} /><span>{locale === "ar" ? product.arabicName : product.name}</span></a>; })}<button onClick={onGuide}><Bot size={15} />{t.notSure}</button></div></nav></>;
}

function Home({ locale, onGuide }: { locale: Locale; onGuide: () => void }) {
  const h = siteCopy[locale].home;
  return <ResearchLanding locale={locale} onGuide={onGuide} hero={<section className="hero-reframe section-shell"><div className="hero-intro"><span className="hero-kicker"><i />{h.kicker}</span><h1><>{h.heading.line1}<br /><em>{h.heading.em}</em><br />{h.heading.line3}</></h1><p>{h.intro}</p><div className="hero-actions"><button className="primary-button" onClick={onGuide}><Sparkles size={18} />{h.describe}</button><a className="quiet-button" href="#ecosystem">{h.seeEcosystem}</a></div></div><div className="hero-route-card"><div className="route-card-head"><span>{h.howYouStart}</span><b>{h.fromGoal}</b></div><div className="route-lanes">{h.steps.map((step, i) => <div key={i}><span>{String(i + 1).padStart(2, "0")}</span><strong>{step.title}</strong><p>{step.body}</p></div>)}</div></div></section>} />;
}

function InfoPage({ slug, locale, onGuide }: { slug: string; locale: Locale; onGuide: () => void }) {
 const detail = siteCopy[locale].routes[slug];
 if (!detail) return null;
 return <main id="main-content" className="page-experience section-shell"><section className="page-hero"><span>{detail.label}</span><h1>{detail.title}</h1><p>{detail.intro}</p></section><PageContent slug={slug} locale={locale} onGuide={onGuide} /></main>;
}

// ---- Footer, one small component per column --------------------------------

function FooterLinks({ links }: { links: LinkCopy[] }) {
  return <>{links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</>;
}

function FooterBrand({ tagline }: { tagline: string }) {
  return <div><Mark /><p>{tagline}</p></div>;
}

function FooterExplore({ locale }: { locale: Locale }) {
  const { nav, footer } = siteCopy[locale];
  return <div><span>{footer.exploreHeading}</span><FooterLinks links={[{ href: "/for-individuals", label: nav.individuals }, { href: "/for-enterprises", label: nav.enterprises }, { href: "/government", label: nav.government }, { href: "/kids", label: footer.kidsParents }]} /></div>;
}

function FooterProducts({ locale }: { locale: Locale }) {
  return <div><span>{siteCopy[locale].nav.products}</span>{products.map((product) => <a key={product.id} href={trustedDomain(product.domain)} target="_blank" rel="noreferrer">{locale === "ar" ? product.arabicName : product.name}</a>)}</div>;
}

function FooterAbout({ locale }: { locale: Locale }) {
  const f = siteCopy[locale].footer;
  // The brand name stays Latin in both languages, marked lang="en" (PR #11).
  return <div><span lang="en">USAM</span><FooterLinks links={[{ href: "/about", label: f.about }, { href: "/trust", label: f.trust }, { href: "/faq", label: f.faq }, { href: "/contact", label: f.contact }]} /></div>;
}

function FooterLegal({ locale }: { locale: Locale }) {
  // All eight legal destinations live together under one "Legal & Privacy"
  // group — including AI & Data Use and Privacy Requests.
  const f = siteCopy[locale].footer;
  return <div className="footer-legal"><span>{f.legalHeading}</span><FooterLinks links={f.legalLinks} /><button type="button" className="footer-cookie-btn" onClick={() => openCookieSettings()}>{f.cookieSettings}</button></div>;
}

function FooterContact({ locale }: { locale: Locale }) {
  return <div className="footer-contact"><span>{siteCopy[locale].footer.contactHeading}</span><ContactInfo locale={locale} variant="footer" /></div>;
}

function FooterUtility({ locale }: { locale: Locale }) {
  const f = siteCopy[locale].footer;
  return <nav className="footer-utility" aria-label={f.utilityLabel}><FooterLinks links={f.utilityLinks} /></nav>;
}

function Footer({ locale }: { locale: Locale }) {
  const f = siteCopy[locale].footer;
  return <footer className="site-footer section-shell"><FooterBrand tagline={f.tagline} /><FooterExplore locale={locale} /><FooterProducts locale={locale} /><FooterAbout locale={locale} /><FooterLegal locale={locale} /><FooterContact locale={locale} /><FooterUtility locale={locale} /><small>{f.copyright}</small></footer>;
}

export function USAMSite({ kind = "home", slug, initialLocale = "en" }: { kind?: RouteKind; slug?: string; initialLocale?: Locale }) {
  // initialLocale comes from the usam-locale cookie on the server, so the first
  // HTML is already in the chosen language (no flash, works without JS).
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready,setReady] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // Only persist language/theme once the user has actually chosen one. Writing
  // defaults for a visitor who never chose would (a) create storage with no
  // consent and (b) re-create the keys immediately after "Reset saved
  // preferences", so a reset would not survive a reload. A real toggle flips
  // this ref via the wrapped setters below.
  const userChose = useRef(false);
  // Narrower: only a LANGUAGE choice (or a restored saved language) may set the
  // usam-locale cookie. A theme-only choice must not.
  const localeChosen = useRef(false);
  useEffect(() => {
    // Restore the saved choice once after hydration. localStorage is not
    // available during the server render, so this must run after mount; the
    // one extra render is intended. The persistence guard (userChose + ready)
    // depends on this exact order, so it is kept as is.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const language=localStorage.getItem("usam-locale"); const mode=localStorage.getItem("usam-theme"); if(language==="ar"||language==="en"){setLocale(language);userChose.current=true;localeChosen.current=true;} if(mode==="dark"||mode==="light"){setTheme(mode);userChose.current=true;} } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    // Always reflect the current locale/theme in the document (not persisted).
    document.documentElement.lang=locale; document.documentElement.dir=locale==="ar"?"rtl":"ltr"; document.documentElement.style.colorScheme=theme;
    // Persist ONLY when the user has made an explicit choice this/!prior session.
    // The guard itself lives in lib/locale.ts (persistPreferences) and is tested there.
    persistPreferences({ ready, userChose: userChose.current, localeChosen: localeChosen.current, locale, theme });
  }, [locale,theme,ready]);
  const chooseLocale = (value: Locale) => { userChose.current = true; localeChosen.current = true; setLocale(value); };
  const chooseTheme = (value: "light" | "dark") => { userChose.current = true; setTheme(value); };
  return <div className={`usam-app theme-${theme} locale-${locale}`} dir={locale === "ar" ? "rtl" : "ltr"}><Nav locale={locale} setLocale={chooseLocale} theme={theme} setTheme={chooseTheme} onGuide={() => setGuideOpen(true)} />{kind === "home" ? <Home locale={locale} onGuide={() => setGuideOpen(true)} /> : <InfoPage slug={slug ?? "explore"} locale={locale} onGuide={() => setGuideOpen(true)} />}<Footer locale={locale} /><GuideConnector theme={theme} locale={locale} open={guideOpen} setOpen={setGuideOpen} /><CookieConsent locale={locale} /><CookieSettingsModal locale={locale} /></div>;
}
