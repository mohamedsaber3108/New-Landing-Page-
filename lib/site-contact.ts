// Single source of truth for USAM's official public contact details.
//
// Every place that shows the address or email (footer, Contact page, legal
// policies, help text) reads from here so the information can never drift.
// To change a detail, edit it HERE only.

export const SITE_CONTACT = {
  /** Official support / contact email. */
  email: "support@usamif.com",
  /** Official address, shown as given by the owner. */
  address: {
    en: "Masr El Gedida, Cairo, Egypt",
    ar: "مصر الجديدة، القاهرة، مصر",
  },
} as const;

export type ContactLocale = "en" | "ar";

export const mailtoHref = `mailto:${SITE_CONTACT.email}`;
