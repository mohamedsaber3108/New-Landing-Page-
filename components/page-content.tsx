"use client";
import Link from "./nav-link";
import { ConnectedJourney } from "./research-landing";
import { useState } from "react";
import { products, routes } from "@/data/products";
import { ContactLeadForm } from "./contact-lead-form";
import { ContactInfo } from "./contact-info";
import { ExploreSearch } from "./explore-search";
import { EnquiryForm } from "./enquiry-form";
import { LegalCenter, LegalPolicy } from "./legal-content";
import { POLICY_TYPES, type PolicyType } from "@/lib/legal/policies";
import { siteCopy } from "@/lib/copy";

const LEGAL_SLUGS = new Set<string>(POLICY_TYPES);

type Locale = "en" | "ar";
// All visible copy lives in lib/copy/en.ts and lib/copy/ar.ts (one typed shape).

export function SiteDirectory({locale}:{locale:Locale}) {
 const p = siteCopy[locale].page;
 return <nav className="site-directory section-shell" aria-label={p.directoryAria}><h2>{p.directoryHeading}</h2><div>{Object.keys(routes).map((slug)=><Link key={slug} href={"/"+slug}>{p.directoryLabels[slug]}</Link>)}</div></nav>;
}
/**
 * Human-readable sitemap (instruction §4/§15 + screenshot "Sitemap"): a grouped
 * directory of every internal page, distinct from the machine sitemap.xml at
 * /sitemap.xml. Links use the plain-anchor Link so they work without JS.
 */
function HumanSitemap({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const s = siteCopy[locale].page.sitemap;
  return (
    <nav className="human-sitemap" aria-label={s.aria}>
      <div className="human-sitemap-grid">
        {s.groups.map((g, gi) => (
          <section key={gi}>
            <h2>{g.title}</h2>
            <ul>
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section>
          <h2>{s.platforms}</h2>
          <ul>
            {products.map((p) => (
              <li key={p.id}>
                <a href={p.domain} target="_blank" rel="noreferrer">
                  {ar ? p.arabicName : p.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="human-sitemap-note">
        {s.note}
      </p>
    </nav>
  );
}

export function PageContent({slug,locale,onGuide}:{slug:string;locale:Locale;onGuide:()=>void}) {
 const ar=locale==="ar"; const [query,setQuery]=useState("");
 const c = siteCopy[locale].page;
 // Legal Center + policy pages render their own structured content (ToC,
 // anchored sections, embedded cookie settings / privacy-request form) and must
 // NOT show the product grid or guide CTA.
 if (slug==="legal") return <div className="page-details"><LegalCenter locale={locale}/></div>;
 if (LEGAL_SLUGS.has(slug)) return <div className="page-details"><LegalPolicy type={slug as PolicyType} locale={locale}/></div>;
 if (slug==="sitemap") return <div className="page-details"><HumanSitemap locale={locale}/></div>;
 const focused=products.filter(p=>slug==="kids"?p.id==="kids":slug==="for-talent"?["career","freelancing"].includes(p.id):true);
 const matches=focused.filter(p=>(ar?p.arabicName+" "+p.arabicFeatures.join(" "):p.name+" "+p.features.join(" ")).toLowerCase().includes(query.toLowerCase()));
 return <div className="page-details">
 {slug==="faq"?<div className="faq-list">{c.faq.map((q,i)=><details key={i}><summary>{q.title}</summary><p>{q.body}</p></details>)}</div>:<div className="editorial-sections">{(c.sections[slug]??[]).map((s,i)=><article key={i}><span>{String(i+1).padStart(2,"0")}</span><h2>{s.title}</h2><p>{s.body}</p></article>)}</div>}
 {(slug==="for-enterprises"||slug==="government")&&<p className="enquiry-cta"><a className="primary-button" href="#enquiry-form">{slug==="government"?c.governmentCta:c.enterpriseCta}</a></p>}
 {slug==="contact"&&<section className="contact-card" id="contact-details" aria-labelledby="contact-details-h"><h2 id="contact-details-h" className="contact-card-title">{c.contactCardTitle}</h2><p className="contact-card-note">{c.contactCardNote}</p><ContactInfo locale={locale} variant="page"/></section>}
 {slug==="contact"&&<ContactLeadForm locale={locale}/>}
 {slug==="ecosystem"&&<ConnectedJourney locale={locale}/>}
 {slug==="explore"&&<ExploreSearch locale={locale}/>}
 {!["faq","cookies"].includes(slug)&&<section><h2>{c.chooseDestination}</h2><div className="page-product-grid">{matches.map(p=><article key={p.id}><h3>{ar?p.arabicName:p.name}</h3><p>{ar?p.arabicDescription:p.description}</p><ul>{(ar?p.arabicFeatures:p.features).map(f=><li key={f}>{f}</li>)}</ul><a className="product-link" href={p.domain} target="_blank" rel="noreferrer">{ar?p.arabicCta:p.cta}</a></article>)}</div>{matches.length===0&&<p role="status">{c.noMatches}</p>}</section>}
 {!["privacy","terms","cookies","status"].includes(slug)&&<section className="page-help"><h2>{c.needHelp}</h2><button className="primary-button" onClick={onGuide}>{c.openGuide}</button></section>}
 {slug==="for-enterprises"&&<div id="enquiry-form" className="enquiry-anchor"><EnquiryForm locale={locale} variant="enterprise"/></div>}
 {slug==="government"&&<div id="enquiry-form" className="enquiry-anchor"><EnquiryForm locale={locale} variant="government"/></div>}
 </div>;
}
