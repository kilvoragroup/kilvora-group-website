import type { StaffRole, Viewer } from "./types";

/**
 * Regras puras de acesso para a apresentação (DAL). Espelham os helpers `private.is_*` da M2:
 *
 * - cliente: `kind = 'cliente'` e `status = 'activo'` (`private.is_account_member`);
 * - staff: `kind = 'interno'`, `status = 'activo'`, papel activo em `user_roles` e `aal = 'aal2'`
 *   (`private.is_staff` / `private.is_admin`).
 *
 * São uma primeira barreira na aplicação. A barreira definitiva continua a ser a RLS e as RPCs.
 */

export type AccessDenial =
  "unauthenticated" | "wrong_kind" | "inactive" | "role_missing" | "mfa_required";

export type AccessDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: AccessDenial };

const ALLOW: AccessDecision = { allowed: true };
const deny = (reason: AccessDenial): AccessDecision => ({ allowed: false, reason });

export const ALL_STAFF_ROLES: readonly StaffRole[] = ["operador", "admin"];

export function decideClientAccess(viewer: Viewer | null): AccessDecision {
  if (!viewer) return deny("unauthenticated");
  if (viewer.profile.kind !== "cliente") return deny("wrong_kind");
  if (viewer.profile.status !== "activo") return deny("inactive");
  return ALLOW;
}

/**
 * Acesso de staff. `allowedRoles` define os papéis aceites (por omissão, operador ou admin).
 * `mfa_required` só é devolvido a quem cumpre todas as outras condições, para não revelar
 * mais do que o necessário a quem não é staff.
 */
export function decideStaffAccess(
  viewer: Viewer | null,
  allowedRoles: readonly StaffRole[] = ALL_STAFF_ROLES,
): AccessDecision {
  if (!viewer) return deny("unauthenticated");
  if (viewer.profile.kind !== "interno") return deny("wrong_kind");
  if (viewer.profile.status !== "activo") return deny("inactive");
  if (allowedRoles.length === 0 || !viewer.roles.some((role) => allowedRoles.includes(role))) {
    return deny("role_missing");
  }
  if (viewer.session.aal !== "aal2") return deny("mfa_required");
  return ALLOW;
}
