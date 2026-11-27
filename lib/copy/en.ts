// English site-shell copy. Shape: lib/copy/types.ts. Arabic twin: ar.ts.
import { routes } from "@/data/products";
import { SITE_CONTACT } from "@/lib/site-contact";
import type { SiteCopy } from "./types";

export const en: SiteCopy = {
  nav: {
    individuals: "Individuals",
    enterprises: "Enterprises",
    government: "Government",
    explore: "Explore",
    ecosystem: "Ecosystem",
    how: "How it works",
    ask: "Ask USAM",
    language: "العربية",
    dark: "Use dark mode",
    light: "Use light mode",
    products: "Products",
    close: "Close",
    skipToContent: "Skip to content",
    navigationMenu: "Navigation menu",
    mobileNavigation: "Mobile navigation",
    kidsParents: "Kids & Parents",
    about: "About",
    notSure: "Not sure where to start?",
  },
  home: {
    kicker: "THE INTELLIGENT FRONT DOOR",
    heading: { line1: "Start with your goal.", em: "Let the system", line3: "clarify the path." },
    intro:
      "USAM connects learning, career growth, independent work, and early discovery. Describe what you are trying to achieve and move directly to the right experience.",
    describe: "Describe your situation",
    seeEcosystem: "See how the ecosystem connects",
    howYouStart: "HOW YOU START",
    fromGoal: "From goal to next step",
    steps: [
      { title: "Describe what you need", body: "In your own words, not by product name." },
      { title: "Discover the right experience", body: "Education, career, freelancing, or kids." },
      { title: "Take the next step", body: "With a specialist guide inside the product." },
    ],
  },
  // English route heroes live with the route catalogue in data/products.ts.
  routes,
  footer: {
    tagline: "Learn · Grow · Work · Discover",
    navLabel: "Footer",
    exploreHeading: "Explore",
    kidsParents: "Kids & Parents",
    companyHeading: "Company",
    companyLinks: [
      { href: "/about", label: "About" },
      { href: "/trust", label: "Trust" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
    ],
    // No "Downloads" entry: no real install or download targets exist yet.
    resourcesHeading: "Resources",
    resourcesLinks: [
      { href: "/guide", label: "Guide" },
      { href: "/status", label: "Status" },
      { href: "/sitemap", label: "Sitemap" },
      { href: "/privacy-requests", label: "Your Privacy Choices" },
    ],
    legalHeading: "Legal & Privacy",
    legalLinks: [
      { href: "/legal", label: "Legal Center" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
      { href: "/cookies", label: "Cookie Policy" },
      { href: "/refunds", label: "Refunds & Cancellations" },
      { href: "/payments", label: "Payment Security" },
      { href: "/ai-use", label: "AI & Data Use" },
      { href: "/privacy-requests", label: "Privacy Requests" },
    ],
    cookieSettings: "Cookie Settings",
    contactHeading: "Contact us",
    copyright: "© 2026 USAM. One connected ecosystem.",
  },
  page: {
    sections: {
      about: [
        { title: "One starting point", body: "Begin with a goal, then continue in a specialist product. USAM Master brings the destinations together." },
        { title: "Learning that connects to work", body: "Build a skill in Education, prepare for opportunities in Career, and apply your expertise through Freelancing." },
        { title: "A place for early discovery", body: "Kids offers a separate route for children and parents to explore learning through missions and projects." },
      ],
      "how-it-works": [
        { title: "1. Describe your goal", body: "Use your own words: learning a skill, preparing for an interview, hiring talent, or helping your child learn." },
        { title: "2. Review a starting point", body: "The guide suggests a product based on your description. You can also browse every product directly." },
        { title: "3. Continue in the product", body: "Open the specialist platform to use its tools. Account, plan, and service conditions are managed there." },
      ],
      "for-individuals": [
        { title: "Build a skill", body: "Explore courses, practice, and simulations in Education. Choose a learning path that supports your goal." },
        { title: "Prepare for an opportunity", body: "Use Career to explore jobs and prepare your CV and interviews. Continue learning when a role calls for a new skill." },
        { title: "Apply your expertise", body: "Explore independent work and specialist services in Freelancing." },
      ],
      "for-enterprises": [
        { title: "Hiring and talent", body: "Start with Career for employment opportunities, or Freelancing for a defined project or specialist service." },
        { title: "Workforce learning", body: "Identify the skills your team needs, the audience, and the desired outcomes before exploring Education." },
        { title: "Prepare your brief", body: "Include your goal, team size, timeline, and required skills. Discuss any custom scope through the relevant platform." },
      ],
      government: [
        { title: "Define the audience", body: "Identify the beneficiaries, locations, skills, and intended outcomes of your initiative." },
        { title: "Select the delivery pathway", body: "Explore learning, career readiness, or youth discovery. A combined program needs an agreed scope." },
        { title: "Agree responsibilities", body: "Confirm delivery, reporting, data handling, and participant support before launching a partnership." },
      ],
      "for-talent": [
        { title: "Show what you can do", body: "Prepare a portfolio with clear examples of your role, skills, and completed work." },
        { title: "Choose your route", body: "Explore employment opportunities in Career or project-based work in Freelancing." },
      ],
      kids: [
        { title: "Explore through doing", body: "Discover coding, English, stories, and creative projects for ages 7–15." },
        { title: "For parents", body: "Review the activities and product terms together. Choose learning that fits your child's interests and needs." },
        { title: "Meet Azouz", body: "Continue in USAM Kids to discover the specialist learning experience and its guide." },
      ],
      pricing: [
        { title: "Choose the product first", body: "Plans and available features are managed by each platform. Open your destination and review its current offer before purchasing." },
        { title: "Currency and prices", body: "The base currency for USAM-owned pricing is the Egyptian Pound (EGP). This website does not sell or take payment and does not invent prices. Any figure in another currency is an estimate, not the final charge — the final amount, currency, taxes and fees are shown on the selling platform before you pay. See Payment Security & Currency." },
        { title: "For organizations", body: "Specify the number of participants, required services, and delivery period when discussing a custom scope." },
        { title: "Billing and payment questions", body: `For a charge, invoice or refund, contact the platform where you paid first. For questions about pricing information on this website, or a payment issue you could not resolve, email ${SITE_CONTACT.email} (${SITE_CONTACT.address.en}).` },
      ],
      contact: [
        { title: "Product help", body: "Open the platform where you need help and use its support channel. Include the page, what happened, and the result you expected." },
        { title: "Partnership enquiries", body: "Prepare a brief with your organization, audience, objective, timeline, and a reply address. Start with the platform relevant to your proposal." },
        { title: "Protect your information", body: "Do not include passwords, payment details, or sensitive personal documents in a general enquiry." },
      ],
      trust: [
        { title: "Product boundaries", body: "This gateway helps you discover products. Review the privacy and service information of each destination before sharing data." },
        { title: "AI guidance", body: "Treat suggestions as starting points. Review information and use your judgment before making career or learning decisions." },
        { title: "Children and parents", body: "Parents should review the Kids experience, applicable terms, and suitability before a child uses it." },
      ],
      privacy: [
        { title: "Your destination matters", body: "Each specialist platform may process different information. Review the privacy notice available within that platform before using its services." },
        { title: "Using the gateway", body: "The route selector matches your typed goal in this page. It is not a connected AI conversation. Do not enter sensitive information." },
      ],
      terms: [
        { title: "Gateway and product services", body: "USAM Master helps you find a destination. Access, subscriptions, payments, and service conditions belong to the product you enter." },
        { title: "Before committing", body: "Review the destination's published terms, cancellation conditions, and privacy information. This directory does not replace those documents." },
      ],
      cookies: [
        { title: "Website preferences", body: "Language and theme preferences are saved on this browser so they carry across visits and pages. Your guide message stays in page memory and is not saved or sent to a model. Product platforms manage their own preferences." },
        { title: "Browser controls", body: "Manage stored site data using your browser's privacy settings. Clearing data can sign you out of connected services." },
      ],
      status: [
        { title: "Check your destination", body: "Open a platform below to check access. This page does not have live service monitoring and does not assert an operational status." },
        { title: "Having trouble?", body: "Record the time, affected page, and error message, then contact the destination's support channel." },
      ],
      guide: [
        { title: "Describe your situation", body: "Choose a starting point or type what you want to achieve. The guide matches your goal to one of the four products." },
        { title: "Continue with a specialist", body: "Open the relevant platform to explore its specialist guidance and available tools. Your message is not automatically transferred from this guide." },
      ],
    },
    faq: [
      { title: "Where should I start?", body: "Choose Explore or describe your goal to the guide. You can open any product directly." },
      { title: "Is this one account for every product?", body: "Account requirements are determined by each destination. Check the sign-in options on the platform you choose." },
      { title: "Can I move between learning and career preparation?", body: "Yes. Use Education to build skills and Career to explore opportunities and prepare applications." },
      { title: "Does this guide provide live AI answers?", body: "This gateway uses a local goal matcher. Specialist experiences are available through the product links." },
      { title: "Where are prices and subscriptions?", body: "Open the relevant product to review its current plans and conditions." },
      { title: "How do parents begin?", body: "Visit Kids & Parents, review the activities, and continue to the Kids platform together." },
    ],
    directoryLabels: Object.fromEntries(Object.entries(routes).map(([slug, page]) => [slug, page.label.replace("FOR ", "")])),
    directoryAria: "All pages",
    directoryHeading: "Explore all of USAM",
    sitemap: {
      aria: "Sitemap",
      groups: [
        {
          title: "Discover",
          links: [
            { href: "/", label: "Home" },
            { href: "/explore", label: "Explore by goal" },
            { href: "/ecosystem", label: "The ecosystem" },
            { href: "/how-it-works", label: "How it works" },
            { href: "/guide", label: "USAM Guide" },
          ],
        },
        {
          title: "For you",
          links: [
            { href: "/for-individuals", label: "For individuals" },
            { href: "/for-enterprises", label: "For enterprises" },
            { href: "/government", label: "For government" },
            { href: "/for-talent", label: "For talent" },
            { href: "/kids", label: "Kids & Parents" },
          ],
        },
        {
          title: "About USAM",
          links: [
            { href: "/about", label: "About" },
            { href: "/trust", label: "Trust & Safety" },
            { href: "/faq", label: "FAQ" },
            { href: "/pricing", label: "Pricing" },
            { href: "/status", label: "Status" },
            { href: "/contact", label: "Contact USAM" },
          ],
        },
        {
          title: "Legal & Privacy",
          links: [
            { href: "/legal", label: "Legal Center" },
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/terms", label: "Terms of Use" },
            { href: "/cookies", label: "Cookie Policy" },
            { href: "/refunds", label: "Refunds & Cancellations" },
            { href: "/payments", label: "Payment Security & Currency" },
            { href: "/ai-use", label: "AI & Data Use" },
            { href: "/privacy-requests", label: "Privacy Requests & Choices" },
          ],
        },
      ],
      platforms: "Platforms",
      note: "Each platform's own pages live inside that platform. A machine-readable version is at /sitemap.xml.",
    },
    governmentCta: "Submit a partnership proposal",
    enterpriseCta: "Contact the enterprise team",
    contactCardTitle: "Our official contact details",
    contactCardNote: "Email us or use the form below, and we will point you to the right team or platform.",
    chooseDestination: "Choose your destination",
    noMatches: "No matches. Try another term.",
    needHelp: "Need help choosing a starting point?",
    openGuide: "Open USAM Guide",
  },
};
