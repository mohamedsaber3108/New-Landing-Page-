import type { Metadata } from "next";
import "./globals.css";
import "./research-landing.css";
import { siteUrl } from "@/lib/site";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
