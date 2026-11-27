import type { Metadata } from "next";
import "./globals.css";
import "./research-landing.css";
import { siteUrl } from "@/lib/site";
import { dirFor } from "@/lib/locale";
import { requestLocale } from "@/lib/request-locale";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "USAM — Learn, Grow, Earn",
  description: "USAM connects learning, career growth, freelancing, and early discovery in one ecosystem.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "USAM — Learn, Grow, Earn",
    description: "USAM connects learning, career growth, freelancing, and early discovery in one ecosystem.",
    url: siteUrl(),
    siteName: "USAM",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg?v=10",
    shortcut: "/favicon.svg?v=10",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-rendered from the usam-locale cookie; unknown -> lang=en dir=ltr.
  const locale = await requestLocale();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
