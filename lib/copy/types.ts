// One typed shape for all site-shell copy (008, L-Q2). en.ts and ar.ts must
// both satisfy SiteCopy, so a key missing in one language fails `tsc`.
// test/copy-parity.test.ts also checks that every nested key and every
// record/array entry exists in both languages.
//
// Only text lives here. Markup, classes, links' rel/target and the order of
// elements stay in the components.

export type LinkCopy = { href: string; label: string };
export type RouteDetail = { title: string; label: string; intro: string };
export type SectionCopy = { title: string; body: string };

export type SiteCopy = {
  nav: {
    individuals: string;
    enterprises: string;
    government: string;
    explore: string;
    ecosystem: string;
    how: string;
    ask: string;
    language: string;
    dark: string;
    light: string;
    products: string;
    close: string;
    skipToContent: string;
    navigationMenu: string;
    mobileNavigation: string;
    kidsParents: string;
    about: string;
    notSure: string;
  };
  home: {
    kicker: string;
    /** Rendered as: line1 <br/> <em>em</em> <br/> line3 */
    heading: { line1: string; em: string; line3: string };
    intro: string;
    describe: string;
    seeEcosystem: string;
    howYouStart: string;
    fromGoal: string;
    steps: [SectionCopy, SectionCopy, SectionCopy];
  };
  /** Info-page hero, by route slug. */
  routes: Record<string, RouteDetail>;
  footer: {
    tagline: string;
    exploreHeading: string;
    kidsParents: string;
    about: string;
    trust: string;
    faq: string;
    contact: string;
    legalHeading: string;
    legalLinks: LinkCopy[];
    cookieSettings: string;
    contactHeading: string;
    utilityLabel: string;
    utilityLinks: LinkCopy[];
    copyright: string;
  };
  page: {
    /** Editorial sections per informational page slug. */
    sections: Record<string, SectionCopy[]>;
    faq: SectionCopy[];
    /** Labels for the (currently unused) SiteDirectory component. */
    directoryLabels: Record<string, string>;
    directoryAria: string;
    directoryHeading: string;
    sitemap: {
      aria: string;
      groups: Array<{ title: string; links: LinkCopy[] }>;
      platforms: string;
      note: string;
    };
    governmentCta: string;
    enterpriseCta: string;
    contactCardTitle: string;
    contactCardNote: string;
    chooseDestination: string;
    noMatches: string;
    needHelp: string;
    openGuide: string;
  };
};
