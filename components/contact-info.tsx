// Official contact details (address + email), rendered from lib/site-contact.
//
// Used in the site footer and on the Contact page so both always match. The
// email is wrapped in <bdi dir="ltr"> so it reads correctly inside Arabic (RTL)
// text, and the layout uses logical CSS properties so it mirrors in RTL.

import { Mail, MapPin } from "lucide-react";
import { SITE_CONTACT, mailtoHref, type ContactLocale } from "@/lib/site-contact";

export function ContactInfo({
  locale,
  variant = "footer",
}: {
  locale: ContactLocale;
  variant?: "footer" | "page";
}) {
  const ar = locale === "ar";
  return (
    <address className={`contact-info contact-info-${variant}`} aria-label={ar ? "بيانات التواصل" : "Contact details"}>
      <p className="contact-info-row">
        <MapPin size={16} aria-hidden="true" />
        <span>
          <b>{ar ? "العنوان" : "Address"}</b>
          <span>{SITE_CONTACT.address[locale]}</span>
        </span>
      </p>
      <p className="contact-info-row">
        <Mail size={16} aria-hidden="true" />
        <span>
          <b>{ar ? "البريد الإلكتروني" : "Email"}</b>
          <a href={mailtoHref}>
            <bdi dir="ltr">{SITE_CONTACT.email}</bdi>
          </a>
        </span>
      </p>
    </address>
  );
}
