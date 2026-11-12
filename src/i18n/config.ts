/**
 * Configuração de idiomas (preparação W1 — sem biblioteca de i18n integrada).
 *
 * Regra do Plano Director: nunca mostrar um idioma sem traduções suficientes.
 * Só os idiomas com `enabled: true` podem ser expostos na interface.
 */
export const locales = [
  { code: "pt-BR", label: "Português (Brasil)", enabled: true },
  { code: "pt-AO", label: "Português (Angola)", enabled: true },
  { code: "en", label: "English", enabled: false },
  { code: "es", label: "Español", enabled: false },
] as const;

export type Locale = (typeof locales)[number]["code"];

/** Idioma inicial apresentado (W2-C: pt-AO). pt-BR mantém-se disponível no conteúdo. */
export const defaultLocale: Locale = "pt-AO";

export function getEnabledLocales(): Locale[] {
  return locales.filter((l) => l.enabled).map((l) => l.code);
}

export function isEnabledLocale(value: string): value is Locale {
  return getEnabledLocales().includes(value as Locale);
}
