// Site locale shared by the server (html lang/dir) and the browser.
//
// The visitor's explicit language choice is kept in localStorage (usam-locale,
// as before) AND, from now on, in a first-party cookie of the same name so the
// server can send <html lang dir> and the page text in that language. The
// cookie is a necessary and functional preference (kind "functional" in
// lib/consent-manager.ts STORAGE_ITEMS): it only carries "en" or "ar", is set
// only after the visitor chooses a language, is listed in Cookie Settings and
// is removed by "Reset saved preferences".

export type SiteLocale = "en" | "ar";

export const LOCALE_COOKIE = "usam-locale";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Unknown or missing value -> English (lang=en dir=ltr). */
export function localeFromCookie(value: string | null | undefined): SiteLocale {
  return value === "ar" ? "ar" : "en";
}

export function dirFor(locale: SiteLocale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Browser only. Call ONLY on an explicit user choice (persistence guard). */
export function writeLocaleCookie(locale: SiteLocale): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Browser only. The persistence guard for language and theme, shared by the
 * site shell (components/usam-site.tsx):
 *  - nothing is written until after the first restore (`ready`);
 *  - localStorage keys are written only once the visitor chose something, or a
 *    saved choice was restored (`userChose`) -- unchanged behaviour;
 *  - the usam-locale COOKIE is written only when the LANGUAGE was chosen or a
 *    saved usam-locale was restored (`localeChosen`). A theme-only choice sets
 *    no cookie, as the Cookie Settings and Cookie Policy say.
 */
export function persistPreferences(p: {
  ready: boolean;
  userChose: boolean;
  localeChosen: boolean;
  locale: SiteLocale;
  theme: "light" | "dark";
}): void {
  if (!p.ready) return;
  if (p.userChose) {
    try {
      localStorage.setItem("usam-locale", p.locale);
      localStorage.setItem("usam-theme", p.theme);
    } catch {
      /* storage disabled */
    }
  }
  if (p.localeChosen) writeLocaleCookie(p.locale);
}

/** Browser only. Used by "Reset saved preferences". */
export function clearLocaleCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
