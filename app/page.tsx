import { USAMSite } from "@/components/usam-site";
import { requestLocale } from "@/lib/request-locale";

// Rendered per request: <html lang dir> and the text depend on the locale cookie.
export const dynamic = "force-dynamic";

export default async function Home() {
  return <USAMSite initialLocale={await requestLocale()} />;
}
