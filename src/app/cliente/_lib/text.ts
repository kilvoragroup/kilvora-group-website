import { site } from "@/config/site";
import { portalAuth } from "@/content/portal-auth";
import { type Text, resolve } from "@/content/types";

import type { CommonText } from "../_components/auth-forms";

/** Resolve um texto para o idioma configurado no servidor. */
export function t(value: Text): string {
  return resolve(value, site.locale) as string;
}

export function commonText(): CommonText {
  const c = portalAuth.common;
  return {
    email: t(c.email),
    password: t(c.password),
    newPassword: t(c.newPassword),
    passwordConfirmation: t(c.passwordConfirmation),
    passwordHint: t(c.passwordHint),
    required: t(c.required),
    sending: t(c.sending),
  };
}

/** Primeiro valor de um parâmetro de pesquisa. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
