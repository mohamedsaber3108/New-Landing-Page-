// Server-only: the visitor locale for this request, from the usam-locale cookie.
import { cookies } from "next/headers";
import { LOCALE_COOKIE, localeFromCookie, type SiteLocale } from "./locale";

export async function requestLocale(): Promise<SiteLocale> {
  try {
    const store = await cookies();
    return localeFromCookie(store.get(LOCALE_COOKIE)?.value);
  } catch {
    return "en"; // outside a request (e.g. build-time analysis)
  }
}
