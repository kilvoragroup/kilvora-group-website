"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { clientRoutes } from "@/config/navigation";
import { site } from "@/config/site";
import { portalClient } from "@/content/portal-client";
import { type LocalizedText, resolve } from "@/content/types";
import { mapPortalError } from "@/domain/portal/errors";
import { checkClientAccess } from "@/lib/portal/dal";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import {
  type Failure,
  addClientMessage,
  cancelClientTicket,
  createClientTicket,
  updateClientAccount,
  updateClientProfile,
} from "@/services/portal/client-portal";

import { ticketPath } from "./_lib/paths";
import type { PortalFormState } from "./_lib/portal-form-state";

/**
 * Server Actions da área do cliente (A3).
 *
 * Ordem obrigatória em cada acção:
 * 1. `assertPortalEnabled()` — com o portal desligado nada chega ao serviço nem ao Supabase;
 * 2. `checkClientAccess()` na DAL (portão S2) — sem sessão → entrada; outro perfil → recusa;
 * 3. o serviço, que valida a entrada e escreve só pelas RPCs/colunas autorizadas.
 *
 * O cliente nunca indica a conta nem o requerente: a base decide pela sessão. `redirect()` é
 * sempre chamado fora de `try/catch`. Sucesso só depois da resposta da base.
 */

const locale = site.locale;
const text = (value: LocalizedText) => resolve(value, locale);

function values(formData: FormData, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = formData.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

function errorState(failure: Failure, sent: Record<string, string>): PortalFormState {
  const fieldErrors: Record<string, string> = {};
  for (const [name, key] of Object.entries(failure.issues ?? {})) {
    if (key) fieldErrors[name] = text(portalClient.fields[key]);
  }
  return { status: "error", message: text(failure.error.message), fieldErrors, values: sent };
}

/** Barreiras 1 e 2. Devolve o id verificado do cliente, ou um estado de erro. */
async function authorise(sent: Record<string, string>): Promise<string | PortalFormState> {
  try {
    assertPortalEnabled();
  } catch {
    return errorState({ error: mapPortalError(new TypeError("unavailable")) }, sent);
  }
  const { viewer, decision } = await checkClientAccess();
  if (!decision.allowed && decision.reason === "unauthenticated") redirect(clientRoutes.signIn);
  if (!decision.allowed || !viewer) {
    return errorState({ error: mapPortalError({ code: "42501" }) }, sent);
  }
  return viewer.profile.id;
}

const NEW_TICKET_FIELDS = ["type", "planId", "subject", "details"] as const;

export async function createTicketAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, NEW_TICKET_FIELDS);
  const viewer = await authorise(sent);
  if (typeof viewer !== "string") return viewer;

  const result = await createClientTicket(sent, locale);
  if (!result.ok) return errorState(result, sent);
  redirect(`${ticketPath(result.value.id)}?aviso=criado`);
}

export async function addMessageAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, ["ticketId", "body"]);
  const viewer = await authorise(sent);
  if (typeof viewer !== "string") return viewer;

  const result = await addClientMessage(sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: text(portalClient.detail.sent) };
}

export async function cancelTicketAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, ["ticketId", "expectedStatus", "reason"]);
  const viewer = await authorise(sent);
  if (typeof viewer !== "string") return viewer;

  const result = await cancelClientTicket(sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: text(portalClient.detail.cancelled) };
}

export async function updateProfileAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, ["fullName", "phone", "locale"]);
  const viewer = await authorise(sent);
  if (typeof viewer !== "string") return viewer;

  const result = await updateClientProfile(viewer, sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: text(portalClient.account.profileSaved) };
}

export async function updateAccountAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, ["name", "country", "sector"]);
  const viewer = await authorise(sent);
  if (typeof viewer !== "string") return viewer;

  const result = await updateClientAccount(viewer, sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: text(portalClient.account.accountSaved) };
}
