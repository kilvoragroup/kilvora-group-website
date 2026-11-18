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
import {
  assignTicket,
  cancelProvisioning,
  changeRole,
  provisionStaff,
  reopenTicket,
  setProfileStatus,
} from "@/services/portal/admin";
import type { Failure, Outcome } from "@/services/portal/client-portal";

import type { PortalFormState } from "../cliente/_lib/portal-form-state";

/**
 * Server Actions da administração (A5). Ordem: interruptor → DAL (só ADMIN com `aal2`) →
 * serviço → RPC administrativa da M2 (que volta a exigir admin `aal2` e audita). O operador
 * recebe uma recusa neutra; sem `aal2`, a verificação TOTP.
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

async function authoriseAdmin(sent: Record<string, string>): Promise<PortalFormState | null> {
  try {
    assertPortalEnabled();
  } catch {
    return errorState({ error: mapPortalError(new TypeError("off")) }, sent);
  }
  const { decision } = await checkStaffAccess(["admin"]);
  if (decision.allowed) return null;
  if (decision.reason === "unauthenticated") redirect(clientRoutes.signIn);
  if (decision.reason === "mfa_required") redirect(consolePaths.mfa);
  return errorState({ error: mapPortalError({ code: "42501" }) }, sent);
}

async function run<T>(
  formData: FormData,
  names: readonly string[],
  service: (sent: Record<string, string>) => Promise<Outcome<T>>,
  success: (value: T) => string,
): Promise<PortalFormState> {
  const sent = values(formData, names);
  const denied = await authoriseAdmin(sent);
  if (denied) return denied;
  const result = await service(sent);
  if (!result.ok) return errorState(result, sent);
  refresh();
  return { status: "success", message: success(result.value) };
}

const a = portalStaff.admin;

export async function assignAction(_p: PortalFormState, formData: FormData) {
  return run(formData, ["ticketId", "operatorId"], assignTicket, () => text(a.assigned));
}

export async function reopenAction(_p: PortalFormState, formData: FormData) {
  return run(formData, ["ticketId", "reason"], reopenTicket, () => text(a.reopened));
}

export async function roleAction(_p: PortalFormState, formData: FormData) {
  return run(formData, ["userId", "role", "change"], changeRole, () => text(a.done));
}

export async function statusAction(_p: PortalFormState, formData: FormData) {
  return run(formData, ["userId", "status"], setProfileStatus, () => text(a.done));
}

export async function provisionAction(_p: PortalFormState, formData: FormData) {
  return run(formData, ["email"], provisionStaff, (value) => `${text(a.provisioned)} ${value.id}`);
}

export async function cancelProvisioningAction(_p: PortalFormState, formData: FormData) {
  return run(formData, ["provisioningId"], cancelProvisioning, () => text(a.cancelled));
}
