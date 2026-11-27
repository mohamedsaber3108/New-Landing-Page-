// Site locale shared by the server (html lang/dir) and the browser.
//
// The visitor's explicit language choice is kept in localStorage (usam-locale,
// as before) AND, from now on, in a first-party cookie of the same name so the
// server can send <html lang dir> and the page text in that language. The
// cookie is a strictly necessary preference (it only carries "en" or "ar" and
// is set only after an explicit choice); it is listed in Cookie Settings and
// removed by "Reset saved preferences".

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

/** Browser only. Used by "Reset saved preferences". */
export function clearLocaleCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
