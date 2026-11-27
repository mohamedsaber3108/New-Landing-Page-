import { USAMSite } from "@/components/usam-site";
import { routes } from "@/data/products";
import { notFound, redirect } from "next/navigation";
import { requestLocale } from "@/lib/request-locale";

// Rendered per request: <html lang dir> and the text depend on the locale cookie.
export const dynamic = "force-dynamic";

export default async function InformationPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  if (slug.length === 1 && slug[0] === "for-business") redirect("/for-enterprises");
  if (slug.length !== 1 || !routes[slug[0]]) notFound();
  return <USAMSite kind="info" slug={slug[0]} initialLocale={await requestLocale()} />;
}
