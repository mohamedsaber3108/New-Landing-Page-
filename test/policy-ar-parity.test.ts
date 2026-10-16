// Proves the Arabic policy experience is REAL — not an assumption from an HTTP
// cookie. The site renders Arabic by selecting the "ar" branch of the policy
// data via localizedPolicy(policy, "ar") after the client reads the saved
// locale; the public SSR HTML is English, so an HTTP scan with a locale cookie
// proves nothing about Arabic. This test exercises the SAME selection the real
// language switch uses and asserts genuine bilingual content + structural
// parity (identical section ids and ordering across EN/AR).

import { describe, expect, it } from "vitest";
import {
  POLICIES,
  POLICY_TYPES,
  localizedPolicy,
  type PolicyType,
} from "@/lib/legal/policies";

/** A string that contains at least one Arabic-script code point. */
function hasArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

/** A string that contains at least one Latin letter (English). */
function hasLatin(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

describe("policy bilingual parity (real language-switch selection path)", () => {
  it("renders every policy's AR branch with non-empty Arabic content", () => {
    for (const type of POLICY_TYPES) {
      const ar = localizedPolicy(POLICIES[type], "ar");
      expect(ar.title, `${type} AR title`).toBeTruthy();
      expect(hasArabic(ar.title), `${type} AR title is Arabic`).toBe(true);
      expect(hasArabic(ar.scope), `${type} AR scope is Arabic`).toBe(true);
      expect(ar.sections.length, `${type} has sections`).toBeGreaterThan(0);
      for (const s of ar.sections) {
        expect(hasArabic(s.heading), `${type}#${s.id} AR heading is Arabic`).toBe(true);
        expect(s.body.length, `${type}#${s.id} AR body non-empty`).toBeGreaterThan(0);
        const joined = s.body.join(" ");
        expect(joined.trim().length, `${type}#${s.id} AR body has text`).toBeGreaterThan(0);
        expect(hasArabic(joined), `${type}#${s.id} AR body is Arabic`).toBe(true);
      }
    }
  });

  it("renders every policy's EN branch with non-empty English content", () => {
    for (const type of POLICY_TYPES) {
      const en = localizedPolicy(POLICIES[type], "en");
      expect(hasLatin(en.title), `${type} EN title is English`).toBe(true);
      expect(en.sections.length).toBeGreaterThan(0);
      for (const s of en.sections) {
        expect(hasLatin(s.heading), `${type}#${s.id} EN heading`).toBe(true);
        expect(s.body.join(" ").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps identical section ids and ordering across EN and AR (structural parity)", () => {
    for (const type of POLICY_TYPES) {
      const en = localizedPolicy(POLICIES[type], "en");
      const ar = localizedPolicy(POLICIES[type], "ar");
      expect(ar.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
      // Same number of paragraphs per section (authored in parallel, not machine-filled).
      for (let i = 0; i < en.sections.length; i++) {
        expect(
          ar.sections[i].body.length,
          `${type}#${en.sections[i].id} paragraph count EN/AR`,
        ).toBe(en.sections[i].body.length);
      }
    }
  });

  it("exposes an honest per-policy updatedAt date for both locales (not a shared constant render)", () => {
    // Each policy carries its own date; at least two distinct dates exist across
    // the set (proving these are independent, not one global value).
    const dates = new Set<string>();
    for (const type of POLICY_TYPES as PolicyType[]) {
      const en = localizedPolicy(POLICIES[type], "en");
      const ar = localizedPolicy(POLICIES[type], "ar");
      expect(en.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ar.updatedAt).toBe(en.updatedAt); // same release date in both locales
      dates.add(en.updatedAt);
    }
    expect(dates.size).toBeGreaterThan(1);
  });
});
