import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { clientRoutes } from "@/config/navigation";
import {
  type AccessDecision,
  ALL_STAFF_ROLES,
  decideClientAccess,
  decideStaffAccess,
} from "@/domain/portal/access";
import {
  type PortalSession,
  type StaffRole,
  type Viewer,
  toAal,
  toPortalLocale,
} from "@/domain/portal/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PROFILE_VIEWER_COLUMNS, USER_ROLE_ACTIVE_COLUMNS } from "./columns";

/**
 * Camada de acesso a dados (DAL) do portal: o ponto de verificação de autorização de cada
 * página e Server Action (portão S2). O proxy nunca substitui esta verificação.
 *
 * - Usa só o cliente de servidor com a sessão do utilizador e a chave publishable: todas as
 *   leituras passam pela RLS da M3. Nenhum acesso privilegiado.
 * - A sessão vem de `auth.getClaims()` (JWT verificado), nunca de `getSession()`.
 * - Os papéis vêm de `public.user_roles` (sem `revoked_at`), nunca de `user_metadata` nem de
 *   `app_metadata`.
 * - `cache()` do React: no máximo uma leitura por pedido; nada é partilhado entre pedidos.
 *   Quem chama tem de estar atrás de `<Suspense>` e fora de `use cache` (lê cookies).
 */

/** Erro de leitura da base (rede, PostgREST). Não contém detalhes da base. */
export class PortalDataError extends Error {
  constructor() {
    super("Não foi possível verificar o acesso ao portal.");
    this.name = "PortalDataError";
  }
}

const getClient = cache(createSupabaseServerClient);

/** Sessão verificada, ou `null` sem sessão válida. */
export const getSession = cache(async (): Promise<PortalSession | null> => {
  const supabase = await getClient();
  let result: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    result = await supabase.auth.getClaims();
  } catch {
    return null;
  }
  const claims = result.data?.claims;
  if (result.error || !claims || typeof claims.sub !== "string" || claims.sub === "") return null;
  return { userId: claims.sub, aal: toAal(claims.aal) };
});

/**
 * Utilizador autenticado com perfil e papéis activos, ou `null` sem sessão ou sem perfil
 * visível. Lança `PortalDataError` se a base não responder (falha fechada: nunca concede acesso).
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session) return null;

  const supabase = await getClient();
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select(PROFILE_VIEWER_COLUMNS).eq("id", session.userId).maybeSingle(),
    supabase
      .from("user_roles")
      .select(USER_ROLE_ACTIVE_COLUMNS)
      .eq("user_id", session.userId)
      .is("revoked_at", null),
  ]);

  if (profileResult.error || rolesResult.error) throw new PortalDataError();
  const profile = profileResult.data;
  if (!profile) return null;

  const roles = (rolesResult.data ?? [])
    .map((row) => row.role)
    .filter((role): role is StaffRole => ALL_STAFF_ROLES.includes(role));

  return {
    session,
    profile: {
      id: profile.id,
      kind: profile.kind,
      status: profile.status,
      fullName: profile.full_name,
      locale: toPortalLocale(profile.locale),
    },
    roles: [...new Set(roles)],
  };
});

export async function checkClientAccess(): Promise<{
  viewer: Viewer | null;
  decision: AccessDecision;
}> {
  const viewer = await getViewer();
  return { viewer, decision: decideClientAccess(viewer) };
}

export async function checkStaffAccess(
  allowedRoles: readonly StaffRole[] = ALL_STAFF_ROLES,
): Promise<{ viewer: Viewer | null; decision: AccessDecision }> {
  const viewer = await getViewer();
  return { viewer, decision: decideStaffAccess(viewer, allowedRoles) };
}

/**
 * Sem sessão → entrada. Qualquer outra recusa → «não encontrado» neutro, para não revelar que a
 * zona ou o recurso existe. Quem precisar de distinguir `mfa_required` (consola, A4) usa
 * `checkStaffAccess`.
 */
function enforce(result: { viewer: Viewer | null; decision: AccessDecision }): Viewer {
  if (result.decision.allowed && result.viewer) return result.viewer;
  if (!result.decision.allowed && result.decision.reason === "unauthenticated") {
    redirect(clientRoutes.signIn);
  }
  notFound();
}

/** Exige um cliente activo. */
export async function requireClient(): Promise<Viewer> {
  return enforce(await checkClientAccess());
}

/** Exige staff `interno`, activo, com um dos papéis indicados e `aal2`. */
export async function requireStaff(
  allowedRoles: readonly StaffRole[] = ALL_STAFF_ROLES,
): Promise<Viewer> {
  return enforce(await checkStaffAccess(allowedRoles));
}
