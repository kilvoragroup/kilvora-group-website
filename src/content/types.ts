/**
 * Tipos partilhados da camada de conteúdo.
 *
 * - `Text`: texto igual nas duas variantes do português, ou um par
 *   { "pt-AO", "pt-BR" } quando a ortografia ou o vocabulário diferem
 *   (pt-AO mantém a norma pré-Acordo usada em Angola; pt-BR segue o Acordo de 1990).
 * - `ContentStatus`: conteúdo `provisorio` nunca é apresentado como facto —
 *   os componentes mostram-no com a indicação «Em validação».
 */
import type { Locale } from "@/i18n/config";

export type PtLocale = Extract<Locale, `pt-${string}`>;

export type ContentStatus = "aprovado" | "provisorio";

export type LocalizedText = { readonly "pt-AO": string; readonly "pt-BR": string };

export type Text = string | LocalizedText;

/** Cria um texto com variantes pt-AO / pt-BR. */
export function v(ptAO: string, ptBR: string): LocalizedText {
  return { "pt-AO": ptAO, "pt-BR": ptBR };
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2 && keys[0] === "pt-AO" && keys[1] === "pt-BR";
}

/** Substitui recursivamente cada `Text` pela string da variante pedida. */
export type Resolved<T> = T extends LocalizedText
  ? string
  : T extends string | number | boolean | null | undefined
    ? T
    : T extends readonly (infer U)[]
      ? Resolved<U>[]
      : { [K in keyof T]: Resolved<T[K]> };

export function resolve<T>(value: T, locale: PtLocale): Resolved<T> {
  if (isLocalizedText(value)) return value[locale] as Resolved<T>;
  if (Array.isArray(value)) return value.map((item) => resolve(item, locale)) as Resolved<T>;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = resolve(item, locale);
    return out as Resolved<T>;
  }
  return value as Resolved<T>;
}
