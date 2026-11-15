import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isPortalEnabled } from "@/config/portal";

/** A área de clientes nunca é indexada (além do `Disallow: /cliente/` no robots.txt). */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

/**
 * Layout da área de clientes. Com o portal desligado (P1), qualquer rota `/cliente/*` dá 404,
 * antes de qualquer leitura de sessão ou contacto com o Supabase.
 */
export default function ClienteLayout({ children }: { children: ReactNode }) {
  if (!isPortalEnabled()) notFound();
  return children;
}
