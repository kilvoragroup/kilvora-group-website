import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { site } from "@/config/site";
import { getContent } from "@/content";

import "./globals.css";

// Tipografia provisória (Geist) até aprovação da tipografia oficial.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const { pages } = getContent();

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — ${site.signature}`, template: `%s | ${site.name}` },
  description: pages.home.description,
  applicationName: site.name,
  // Indexação bloqueada até à autorização de publicação (W5).
  robots: site.indexable
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: site.locale.replace("-", "_"),
    title: `${site.name} — ${site.signature}`,
    description: pages.home.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const { common } = getContent();
  return (
    <html
      lang={site.locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SkipLink label={common.skipToContent} />
        <SiteHeader />
        <main id="conteudo" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <WhatsAppButton />
      </body>
    </html>
  );
}
