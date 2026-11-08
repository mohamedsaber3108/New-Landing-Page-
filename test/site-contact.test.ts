// Guards the official contact details: one source of truth, shown in both
// languages on the policies that must carry them, with no stale/placeholder
// emails anywhere in the policy text.

import { describe, expect, it } from "vitest";
import { SITE_CONTACT } from "@/lib/site-contact";
import { POLICIES, POLICY_TYPES, localizedPolicy } from "@/lib/legal/policies";

describe("official contact details", () => {
  it("has the official email and address in EN and AR", () => {
    expect(SITE_CONTACT.email).toBe("support@usamif.com");
    expect(SITE_CONTACT.address.en).toBe("Masr El Gedida, Cairo, Egypt");
    expect(/[\u0600-\u06FF]/.test(SITE_CONTACT.address.ar)).toBe(true);
  });

  it("shows email + address in payments, refunds, privacy, terms and privacy-requests (EN and AR)", () => {
    for (const type of ["payments", "refunds", "privacy", "terms", "privacy-requests"] as const) {
      for (const locale of ["en", "ar"] as const) {
        const blob = JSON.stringify(localizedPolicy(POLICIES[type], locale));
        expect(blob, `${type}/${locale} email`).toContain(SITE_CONTACT.email);
        expect(blob, `${type}/${locale} address`).toContain(SITE_CONTACT.address[locale]);
      }
    }
  });

  it("uses no other email address in any policy", () => {
    const emails = new Set<string>();
    for (const type of POLICY_TYPES) {
      for (const locale of ["en", "ar"] as const) {
        const blob = JSON.stringify(localizedPolicy(POLICIES[type], locale));
        for (const m of blob.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) emails.add(m.toLowerCase());
      }
    }
    expect([...emails]).toEqual([SITE_CONTACT.email]);
  });
});
