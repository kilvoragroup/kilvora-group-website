import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isPortalEnabled } from "@/config/portal";

/** A consola interna nunca é indexada (D02; além do `Disallow: /interno/` no robots.txt). */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

/**
 * Layout da consola interna (A4). Com o portal desligado (P1), qualquer rota `/interno/*` dá
 * 404 antes de qualquer leitura de sessão ou contacto com o Supabase.
 */
export default function InternoLayout({ children }: { children: ReactNode }) {
  if (!isPortalEnabled()) notFound();
  return children;
}
