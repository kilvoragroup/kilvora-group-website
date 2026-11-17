"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { clientRoutes } from "@/config/navigation";
import { site } from "@/config/site";
import { portalClient } from "@/content/portal-client";
import { portalStaff } from "@/content/portal-staff";
import { type LocalizedText, resolve } from "@/content/types";
import { mapPortalError } from "@/domain/portal/errors";
import { checkStaffAccess, consolePaths } from "@/lib/portal/dal";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import type { Failure } from "@/services/portal/client-portal";
import { startTotpEnrollment, verifyTotp } from "@/services/portal/mfa";
import {
  addInternalNote,
  addStaffMessage,
  changeStaffTicketStatus,
} from "@/services/portal/staff-console";

import type { PortalFormState } from "../cliente/_lib/portal-form-state";
import type { MfaState } from "./_lib/mfa-state";

/**
 * Server Actions da consola interna (A4).
 *
 * Ordem obrigatória: interruptor do portal → DAL (`checkStaffAccess`: staff `interno`, activo,
 * com papel e `aal2`) → serviço (RPC da M2). As acções de MFA exigem o oposto: staff a quem só
 * falta o `aal2`. A base volta a exigir `aal2` em todos os helpers internos (S7).
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

function portalOn(): boolean {
  try {
    assertPortalEnabled();
    return true;
  } catch {
    return false;
  }
}

/** Interruptor + staff com `aal2`. Devolve o estado de erro, ou `null` se autorizado. */
async function authoriseStaff(sent: Record<string, string>): Promise<PortalFormState | null> {
  if (!portalOn()) return errorState({ error: mapPortalError(new TypeError("off")) }, sent);
  const { decision } = await checkStaffAccess();
  if (decision.allowed) return null;
  if (decision.reason === "unauthenticated") redirect(clientRoutes.signIn);
  if (decision.reason === "mfa_required") redirect(consolePaths.mfa);
  return errorState({ error: mapPortalError({ code: "42501" }) }, sent);
}

export async function staffMessageAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, ["ticketId", "body"]);
  const denied = await authoriseStaff(sent);
  if (denied) return denied;
  const result = await addStaffMessage(sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: text(portalStaff.detail.sent) };
}

export async function internalNoteAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, ["ticketId", "body"]);
  const denied = await authoriseStaff(sent);
  if (denied) return denied;
  const result = await addInternalNote(sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: text(portalStaff.detail.noteAdded) };
}

export async function transitionAction(
  _previous: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const sent = values(formData, [
    "ticketId",
    "expectedStatus",
    "toStatus",
    "reason",
    "evidenceRef",
  ]);
  const denied = await authoriseStaff(sent);
  if (denied) return denied;
  const result = await changeStaffTicketStatus(sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: text(portalStaff.detail.applied) };
}

// ---------------------------------------------------------------------------------------------
// MFA (staff a quem só falta o aal2)
// ---------------------------------------------------------------------------------------------

async function authorisePendingMfa(): Promise<MfaState | null> {
  if (!portalOn()) return { status: "error", message: text(portalStaff.mfa.unavailable) };
  const { decision } = await checkStaffAccess();
  if (decision.allowed) redirect(consolePaths.home);
  if (decision.reason === "unauthenticated") redirect(clientRoutes.signIn);
  if (decision.reason !== "mfa_required") {
    return { status: "error", message: text(mapPortalError({ code: "42501" }).message) };
  }
  return null;
}

export async function startEnrollmentAction(): Promise<MfaState> {
  const denied = await authorisePendingMfa();
  if (denied) return denied;
  const result = await startTotpEnrollment();
  if (!result.ok) return { status: "error", message: text(portalStaff.mfa.unavailable) };
  return { status: "enrolling", ...result.value };
}

export async function verifyTotpAction(_previous: MfaState, formData: FormData): Promise<MfaState> {
  const denied = await authorisePendingMfa();
  if (denied) return denied;
  const result = await verifyTotp({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });
  if (!result.ok) {
    const message =
      result.error === "unavailable"
        ? text(portalStaff.mfa.unavailable)
        : text(portalStaff.mfa.failed);
    return { status: "error", message };
  }
  redirect(consolePaths.home);
}
