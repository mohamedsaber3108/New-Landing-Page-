"use client";
import Link from "next/link";
import { ConnectedJourney } from "./research-landing";
import { useState } from "react";
import { products, routes } from "@/data/products";
import { ContactLeadForm } from "./contact-lead-form";
import { ExploreSearch } from "./explore-search";

type Locale = "en" | "ar";
type Section = [string, string, string, string];
const content: Record<string, Section[]> = {
 about: [
 ["One starting point", "Begin with a goal, then continue in a specialist product. USAM Master brings the destinations together.", "نقطة بداية واحدة", "ابدأ بهدفك ثم أكمل داخل المنتج المتخصص. تجمع يوزم الرئيسية الوجهات في مكان واحد."],
 ["Learning that connects to work", "Build a skill in Education, prepare for opportunities in Career, and apply your expertise through Freelancing.", "تعلّم يرتبط بالعمل", "ابنِ مهارة في التعليم، واستعد للفرص في المسار المهني، وطبّق خبرتك من خلال العمل الحر."],
 ["A place for early discovery", "Kids offers a separate route for children and parents to explore learning through missions and projects.", "مساحة للاكتشاف المبكر", "يقدم منتج الأطفال مسارًا مستقلًا للأطفال وأولياء الأمور لاكتشاف التعلم بالمهمات والمشروعات."]],
 "how-it-works": [
 ["1. Describe your goal", "Use your own words: learning a skill, preparing for an interview, hiring talent, or helping your child learn.", "١. صف هدفك", "اكتب بكلماتك: تعلم مهارة، أو الاستعداد لمقابلة، أو توظيف موهبة، أو مساعدة طفلك على التعلم."],
 ["2. Review a starting point", "The guide suggests a product based on your description. You can also browse every product directly.", "٢. راجع نقطة البداية", "يقترح الدليل منتجًا بناءً على وصفك، ويمكنك أيضًا استعراض جميع المنتجات مباشرة."],
 ["3. Continue in the product", "Open the specialist platform to use its tools. Account, plan, and service conditions are managed there.", "٣. أكمل داخل المنتج", "افتح المنصة المتخصصة لاستخدام أدواتها. تُدار الحسابات والخطط وشروط الخدمة داخلها."]],
 "for-individuals": [
 ["Build a skill", "Explore courses, practice, and simulations in Education. Choose a learning path that supports your goal.", "ابنِ مهارة", "استكشف الدورات والممارسة والمحاكاة في التعليم، واختر مسارًا يخدم هدفك."],
 ["Prepare for an opportunity", "Use Career to explore jobs and prepare your CV and interviews. Continue learning when a role calls for a new skill.", "استعد لفرصة", "استكشف الوظائف وجهّز سيرتك الذاتية ومقابلاتك في المسار المهني، وارجع للتعلم عند الحاجة إلى مهارة جديدة."],
 ["Apply your expertise", "Explore independent work and specialist services in Freelancing.", "طبّق خبرتك", "استكشف العمل المستقل والخدمات المتخصصة في منصة العمل الحر."]],
 "for-enterprises": [
 ["Hiring and talent", "Start with Career for employment opportunities, or Freelancing for a defined project or specialist service.", "التوظيف والمواهب", "ابدأ بالمسار المهني لفرص التوظيف، أو بالعمل الحر للمشروعات المحددة والخدمات المتخصصة."],
 ["Workforce learning", "Identify the skills your team needs, the audience, and the desired outcomes before exploring Education.", "تعلّم فرق العمل", "حدّد المهارات المطلوبة لفريقك والفئة المستهدفة والنتائج قبل استكشاف التعليم."],
 ["Prepare your brief", "Include your goal, team size, timeline, and required skills. Discuss any custom scope through the relevant platform.", "جهّز وصف احتياجك", "اكتب الهدف وحجم الفريق والمدة والمهارات المطلوبة، وناقش النطاق المخصص عبر المنصة المناسبة."]],
 government: [
 ["Define the audience", "Identify the beneficiaries, locations, skills, and intended outcomes of your initiative.", "حدّد الفئة المستهدفة", "حدّد المستفيدين والمناطق والمهارات والنتائج المطلوبة للمبادرة."],
 ["Select the delivery pathway", "Explore learning, career readiness, or youth discovery. A combined program needs an agreed scope.", "اختر مسار التنفيذ", "استكشف التعلم أو الاستعداد المهني أو اكتشاف الأطفال. يحتاج البرنامج المشترك إلى نطاق متفق عليه."],
 ["Agree responsibilities", "Confirm delivery, reporting, data handling, and participant support before launching a partnership.", "اتفق على المسؤوليات", "حدّد التنفيذ والتقارير والتعامل مع البيانات ودعم المشاركين قبل إطلاق الشراكة."]],
 "for-talent": [
 ["Show what you can do", "Prepare a portfolio with clear examples of your role, skills, and completed work.", "اعرض قدراتك", "جهّز ملف أعمال يوضح دورك ومهاراتك ونماذج الأعمال المنجزة."],
 ["Choose your route", "Explore employment opportunities in Career or project-based work in Freelancing.", "اختر مسارك", "استكشف فرص التوظيف في المسار المهني أو العمل بالمشروعات في منصة العمل الحر."]],
 kids: [
 ["Explore through doing", "Discover coding, English, stories, and creative projects for ages 7–15.", "اكتشف بالممارسة", "استكشف البرمجة والإنجليزية والقصص والمشروعات الإبداعية للأعمار من ٧ إلى ١٥ سنة."],
 ["For parents", "Review the activities and product terms together. Choose learning that fits your child's interests and needs.", "لأولياء الأمور", "راجعوا الأنشطة وشروط المنتج معًا، واختاروا تعلمًا يناسب اهتمامات الطفل واحتياجاته."],
 ["Meet Azouz", "Continue in USAM Kids to discover the specialist learning experience and its guide.", "تعرّف على عزوز", "انتقل إلى يوزم للأطفال لاستكشاف تجربة التعلم ودليلها المتخصص."]],
 pricing: [
 ["Choose the product first", "Plans and available features are managed by each platform. Open your destination and review its current offer before purchasing.", "اختر المنتج أولًا", "تدير كل منصة الخطط والمزايا المتاحة. افتح وجهتك وراجع عرضها الحالي قبل الشراء."],
 ["For organizations", "Specify the number of participants, required services, and delivery period when discussing a custom scope.", "للمؤسسات", "حدّد عدد المشاركين والخدمات المطلوبة ومدة التنفيذ عند مناقشة نطاق مخصص."]],
 contact: [
 ["Product help", "Open the platform where you need help and use its support channel. Include the page, what happened, and the result you expected.", "مساعدة في منتج", "افتح المنصة التي تحتاج المساعدة فيها واستخدم قناة دعمها. وضّح الصفحة وما حدث والنتيجة المتوقعة."],
 ["Partnership enquiries", "Prepare a brief with your organization, audience, objective, timeline, and a reply address. Start with the platform relevant to your proposal.", "استفسارات الشراكات", "جهّز نبذة تشمل مؤسستك والفئة المستهدفة والهدف والموعد ووسيلة الرد، ثم ابدأ بالمنصة المناسبة للمقترح."],
 ["Protect your information", "Do not include passwords, payment details, or sensitive personal documents in a general enquiry.", "احمِ معلوماتك", "لا تُدرج كلمات المرور أو بيانات الدفع أو المستندات الشخصية الحساسة في الاستفسار العام."]],
 trust: [
 ["Product boundaries", "This gateway helps you discover products. Review the privacy and service information of each destination before sharing data.", "حدود المنتجات", "تساعدك هذه البوابة على اكتشاف المنتجات. راجع معلومات الخصوصية والخدمة لكل وجهة قبل مشاركة البيانات."],
 ["AI guidance", "Treat suggestions as starting points. Review information and use your judgment before making career or learning decisions.", "إرشاد الذكاء الاصطناعي", "اعتبر الاقتراحات نقاط بداية. راجع المعلومات واستخدم تقديرك قبل اتخاذ القرارات المهنية والتعليمية."],
 ["Children and parents", "Parents should review the Kids experience, applicable terms, and suitability before a child uses it.", "الأطفال وأولياء الأمور", "ينبغي لولي الأمر مراجعة تجربة الأطفال وشروطها ومدى ملاءمتها قبل استخدامها."]],
 privacy: [
 ["Your destination matters", "Each specialist platform may process different information. Review the privacy notice available within that platform before using its services.", "الوجهة تحدّد التفاصيل", "قد تتعامل كل منصة متخصصة مع معلومات مختلفة. راجع إشعار الخصوصية داخلها قبل استخدام خدماتها."],
 ["Using the gateway", "The route selector matches your typed goal in this page. It is not a connected AI conversation. Do not enter sensitive information.", "استخدام البوابة", "يطابق محدّد المسار هدفك المكتوب داخل هذه الصفحة. وهو ليس محادثة متصلة بنموذج ذكاء اصطناعي. لا تُدخل معلومات حساسة."]],
 terms: [
 ["Gateway and product services", "USAM Master helps you find a destination. Access, subscriptions, payments, and service conditions belong to the product you enter.", "البوابة وخدمات المنتجات", "تساعدك يوزم الرئيسية على اختيار وجهة. ترتبط شروط الدخول والاشتراك والدفع والخدمة بالمنتج الذي تستخدمه."],
 ["Before committing", "Review the destination's published terms, cancellation conditions, and privacy information. This directory does not replace those documents.", "قبل الالتزام", "راجع شروط الوجهة المنشورة وأحكام الإلغاء ومعلومات الخصوصية. لا يحل هذا الدليل محل تلك المستندات."]],
 cookies: [
 ["Website preferences", "Language and theme preferences are saved on this browser so they carry across visits and pages. Your guide message stays in page memory and is not saved or sent to a model. Product platforms manage their own preferences.", "تفضيلات الموقع", "تُحفظ اللغة والمظهر في هذا المتصفح بين الصفحات والزيارات. تظل رسالة الدليل في ذاكرة الصفحة ولا تُحفظ أو تُرسل إلى نموذج. تدير المنصات الأخرى تفضيلاتها بشكل مستقل."],
 ["Browser controls", "Manage stored site data using your browser's privacy settings. Clearing data can sign you out of connected services.", "إعدادات المتصفح", "أدر بيانات المواقع المخزّنة من إعدادات الخصوصية في متصفحك. قد يؤدي مسح البيانات إلى تسجيل خروجك من الخدمات المتصلة."]],
 status: [
 ["Check your destination", "Open a platform below to check access. This page does not have live service monitoring and does not assert an operational status.", "تحقّق من وجهتك", "افتح إحدى المنصات للتحقق من الوصول. هذه الصفحة لا تتصل بمراقبة مباشرة للخدمات ولا تؤكد حالتها التشغيلية."],
 ["Having trouble?", "Record the time, affected page, and error message, then contact the destination's support channel.", "تواجه مشكلة؟", "سجّل الوقت والصفحة المتأثرة ورسالة الخطأ، ثم تواصل مع قناة دعم المنصة."]],
 guide: [
 ["Describe your situation", "Choose a starting point or type what you want to achieve. The guide matches your goal to one of the four products.", "صف حالتك", "اختر نقطة بداية أو اكتب ما تريد تحقيقه. يطابق الدليل هدفك مع أحد المنتجات الأربعة."],
 ["Continue with a specialist", "Open the relevant platform to explore its specialist guidance and available tools. Your message is not automatically transferred from this guide.", "أكمل مع الدليل المتخصص", "افتح المنصة المناسبة لاستكشاف أدواتها ومساعدتها المتخصصة. لا تنتقل رسالتك من هذا الدليل تلقائيًا."]],
};
const faq: Section[] = [
 ["Where should I start?", "Choose Explore or describe your goal to the guide. You can open any product directly.", "من أين أبدأ؟", "اختر استكشف أو صف هدفك للدليل. ويمكنك فتح أي منتج مباشرة."],
 ["Is this one account for every product?", "Account requirements are determined by each destination. Check the sign-in options on the platform you choose.", "هل يوجد حساب واحد لكل المنتجات؟", "تحدّد كل منصة متطلبات الحساب. راجع خيارات تسجيل الدخول في المنصة التي تختارها."],
 ["Can I move between learning and career preparation?", "Yes. Use Education to build skills and Career to explore opportunities and prepare applications.", "هل يمكنني الانتقال بين التعلم والاستعداد المهني؟", "نعم. استخدم التعليم لبناء المهارات، والمسار المهني لاستكشاف الفرص وتجهيز طلبات التقديم."],
 ["Does this guide provide live AI answers?", "This gateway uses a local goal matcher. Specialist experiences are available through the product links.", "هل يقدم هذا الدليل إجابات ذكاء اصطناعي مباشرة؟", "تستخدم هذه البوابة مطابقة محلية للأهداف. تتوفر التجارب المتخصصة عبر روابط المنتجات."],
 ["Where are prices and subscriptions?", "Open the relevant product to review its current plans and conditions.", "أين الأسعار والاشتراكات؟", "افتح المنتج المناسب لمراجعة خططه وشروطه الحالية."],
 ["How do parents begin?", "Visit Kids & Parents, review the activities, and continue to the Kids platform together.", "كيف يبدأ أولياء الأمور؟", "زوروا صفحة الأطفال وأولياء الأمور، وراجعوا الأنشطة، ثم انتقلوا إلى منصة الأطفال معًا."]
];
const labels: Record<string,string> = {about:"عن يوزم",ecosystem:"المنظومة",explore:"استكشف","how-it-works":"كيف تعمل يوزم","for-individuals":"الأفراد","for-enterprises":"المؤسسات",government:"الجهات الحكومية","for-talent":"المواهب",kids:"الأطفال وأولياء الأمور",pricing:"الأسعار",contact:"التواصل",trust:"الثقة",faq:"الأسئلة الشائعة",guide:"دليل يوزم",privacy:"الخصوصية",terms:"الشروط",cookies:"ملفات الارتباط",status:"حالة الخدمات"};
export function SiteDirectory({locale}:{locale:Locale}) {
 return <nav className="site-directory section-shell" aria-label={locale==="ar"?"جميع الصفحات":"All pages"}><h2>{locale==="ar"?"جميع صفحات يوزم":"Explore all of USAM"}</h2><div>{Object.entries(routes).map(([slug,page])=><Link key={slug} href={"/"+slug}>{locale==="ar"?labels[slug]:page.label.replace("FOR ","")}</Link>)}</div></nav>;
}
export function PageContent({slug,locale,onGuide}:{slug:string;locale:Locale;onGuide:()=>void}) {
 const ar=locale==="ar"; const [query,setQuery]=useState("");
 const focused=products.filter(p=>slug==="kids"?p.id==="kids":slug==="for-talent"?["career","freelancing"].includes(p.id):true);
 const matches=focused.filter(p=>(ar?p.arabicName+" "+p.arabicFeatures.join(" "):p.name+" "+p.features.join(" ")).toLowerCase().includes(query.toLowerCase()));
 return <div className="page-details">
 {slug==="faq"?<div className="faq-list">{faq.map(([title,body,at,ab])=><details key={title}><summary>{ar?at:title}</summary><p>{ar?ab:body}</p></details>)}</div>:<div className="editorial-sections">{(content[slug]??[]).map(([title,body,at,ab],i)=><article key={title}><span>{String(i+1).padStart(2,"0")}</span><h2>{ar?at:title}</h2><p>{ar?ab:body}</p></article>)}</div>}
 {slug==="contact"&&<ContactLeadForm locale={locale}/>}
 {slug==="ecosystem"&&<ConnectedJourney locale={locale}/>}
 {slug==="explore"&&<ExploreSearch locale={locale}/>}
 {!["faq","cookies"].includes(slug)&&<section><h2>{ar?"اختر وجهتك":"Choose your destination"}</h2><div className="page-product-grid">{matches.map(p=><article key={p.id}><h3>{ar?p.arabicName:p.name}</h3><p>{ar?p.arabicDescription:p.description}</p><ul>{(ar?p.arabicFeatures:p.features).map(f=><li key={f}>{f}</li>)}</ul><a className="product-link" href={p.domain} target="_blank" rel="noreferrer">{ar?p.arabicCta:p.cta}</a></article>)}</div>{matches.length===0&&<p role="status">{ar?"لا توجد نتائج. جرّب كلمة أخرى.":"No matches. Try another term."}</p>}</section>}
 {!["privacy","terms","cookies","status"].includes(slug)&&<section className="page-help"><h2>{ar?"تحتاج مساعدة في اختيار البداية؟":"Need help choosing a starting point?"}</h2><button className="primary-button" onClick={onGuide}>{ar?"افتح دليل يوزم":"Open USAM Guide"}</button></section>}
 </div>;
}
