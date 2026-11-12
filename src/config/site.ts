import { defaultLocale } from "@/i18n/config";
import type { PtLocale } from "@/content/types";

import { isIndexableEnv } from "./seo";

/**
 * Configuração institucional do site.
 *
 * IDENTIDADE PROVISÓRIA: o logótipo oficial (3D) não tem versão web utilizável
 * (PNG sem transparência). Até existir um SVG aprovado, o site usa a marca
 * nominativa tipográfica «KILVORA GROUP» (ver `components/brand-wordmark.tsx`).
 */
export const site = {
  name: "KILVORA GROUP",
  /** Assinatura principal aprovada. */
  signature: "Juntos por um futuro maior",
  /** Frase institucional usada na proposta comercial. */
  tagline: "Tecnologia, inovação e soluções digitais orientadas para o negócio.",
  /** Variante de português apresentada. Ambas (pt-AO, pt-BR) existem no conteúdo. */
  locale: defaultLocale as PtLocale,
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  /** Indexável apenas em Production (`VERCEL_ENV=production`); bloqueado nos restantes ambientes. */
  indexable: isIndexableEnv(process.env.VERCEL_ENV),
  brand: {
    logo: { kind: "wordmark", status: "provisorio" },
    typography: { family: "Geist", status: "provisorio" },
    palette: { status: "provisorio" },
  },
} as const;

export type Site = typeof site;
