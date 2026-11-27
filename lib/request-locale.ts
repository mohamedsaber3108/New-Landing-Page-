// Server-only: the visitor locale for this request, from the usam-locale cookie.
import { cookies } from "next/headers";
import { LOCALE_COOKIE, localeFromCookie, type SiteLocale } from "./locale";

export async function requestLocale(): Promise<SiteLocale> {
  // No try/catch on purpose: outside a request (e.g. a build-time prerender)
  // cookies() throws, and that must surface instead of silently baking an
  // English page. The pages and layout are force-dynamic, so it never happens
  // in normal operation.
  const store = await cookies();
  return localeFromCookie(store.get(LOCALE_COOKIE)?.value);
}
