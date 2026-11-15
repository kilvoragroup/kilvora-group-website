"use server";

import { redirect } from "next/navigation";

import { clientRoutes } from "@/config/navigation";
import { site } from "@/config/site";
import { portalAuth } from "@/content/portal-auth";
import { resolve } from "@/content/types";
import { type AuthFailure, FIELD_MESSAGES, authFailure } from "@/domain/portal/auth-errors";
import { safeNext } from "@/lib/portal/auth-urls";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import {
  requestPasswordRecovery,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "@/services/portal/auth";

import type { FormState, FormValues } from "./_lib/form-state";

/**
 * Server Actions da autenticação do portal (A2-B3).
 *
 * - Cada acção chama `assertPortalEnabled()` antes de tudo: com o portal desligado não chega
 *   ao serviço nem ao Supabase (uma acção pode ser invocada por POST mesmo sem página).
 * - As regras de autenticação vivem só em `src/services/portal/auth.ts`.
 * - `redirect()` é sempre chamado FORA de `try/catch` (lança um erro de controlo do Next).
 * - O estado devolvido nunca contém palavras-passe nem detalhes do Auth.
 * - O idioma vem da configuração do servidor (`site.locale`), nunca do cliente.
 */

const locale = site.locale;
const text = (value: Parameters<typeof resolve>[0]) => resolve(value, locale) as string;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function portalUnavailable(): FormState | null {
  try {
    assertPortalEnabled();
    return null;
  } catch {
    return errorState(authFailure("unavailable"), {});
  }
}

function errorState(failure: AuthFailure, values: FormValues): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const [name, issue] of Object.entries(failure.fieldErrors ?? {})) {
    if (issue) fieldErrors[name] = text(FIELD_MESSAGES[issue]);
  }
  return { status: "error", message: text(failure.message), fieldErrors, values };
}

function withNotice(path: string, notice: string): string {
  return `${path}?aviso=${encodeURIComponent(notice)}`;
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const unavailable = portalUnavailable();
  if (unavailable) return unavailable;

  const email = field(formData, "email");
  const result = await signIn({ email, password: field(formData, "password") });
  if (!result.ok) return errorState(result.error, { email });

  redirect(safeNext(field(formData, "next")));
}

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const unavailable = portalUnavailable();
  if (unavailable) return unavailable;

  const values: FormValues = {
    email: field(formData, "email"),
    fullName: field(formData, "fullName"),
    company: field(formData, "company"),
  };
  const result = await signUp({
    ...values,
    password: field(formData, "password"),
    passwordConfirmation: field(formData, "passwordConfirmation"),
    locale,
  });
  if (!result.ok) return errorState(result.error, values);
  return { status: "success", message: text(portalAuth.signUp.success) };
}

export async function recoveryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const unavailable = portalUnavailable();
  if (unavailable) return unavailable;

  const email = field(formData, "email");
  const result = await requestPasswordRecovery({ email });
  if (!result.ok) return errorState(result.error, { email });
  return { status: "success", message: text(portalAuth.recovery.success) };
}

export async function newPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unavailable = portalUnavailable();
  if (unavailable) return unavailable;

  const result = await updatePassword({
    password: field(formData, "password"),
    passwordConfirmation: field(formData, "passwordConfirmation"),
  });
  if (!result.ok) return errorState(result.error, {});

  redirect(withNotice(clientRoutes.signIn, "palavra-passe-alterada"));
}

/** Saída: só por POST (formulário). Nunca por GET nem por ligação. */
export async function signOutAction(): Promise<void> {
  if (portalUnavailable()) return;

  const result = await signOut();
  redirect(withNotice(clientRoutes.signIn, result.ok ? "sessao-terminada" : "indisponivel"));
}
