import type { Database } from "@/lib/supabase/database.types";

/**
 * Tipos de domínio do portal, derivados dos enums da base (`database.types.ts`).
 * Sem I/O: podem ser usados no servidor, no cliente e nos testes.
 */
type Enums = Database["public"]["Enums"];

export type ProfileKind = Enums["profile_kind"];
export type ProfileStatus = Enums["profile_status"];
export type StaffRole = Enums["staff_role"];
export type AccountStatus = Enums["account_status"];
export type MemberRole = Enums["member_role"];
export type TicketStatus = Enums["ticket_status"];
export type TicketType = Enums["ticket_type"];
export type TicketEventType = Enums["ticket_event_type"];
export type EventVisibility = Enums["event_visibility"];
export type PortalLocale = "pt-AO" | "pt-BR";

/** Nível de garantia da autenticação (claim `aal` do JWT). Outros valores contam como `null`. */
export type Aal = "aal1" | "aal2";

/** Sessão validada (claims do JWT verificadas por `auth.getClaims()`). */
export type PortalSession = {
  readonly userId: string;
  readonly aal: Aal | null;
};

/** Perfil próprio, tal como lido sob a RLS da M3. */
export type ViewerProfile = {
  readonly id: string;
  readonly kind: ProfileKind;
  readonly status: ProfileStatus;
  readonly fullName: string | null;
  readonly locale: PortalLocale;
};

/**
 * Utilizador autenticado com o perfil e os papéis activos.
 * Os papéis vêm de `public.user_roles` (sem `revoked_at`), nunca de metadados do Auth.
 */
export type Viewer = {
  readonly session: PortalSession;
  readonly profile: ViewerProfile;
  readonly roles: readonly StaffRole[];
};

export function toAal(value: unknown): Aal | null {
  return value === "aal1" || value === "aal2" ? value : null;
}

export function toPortalLocale(value: unknown): PortalLocale {
  return value === "pt-BR" ? "pt-BR" : "pt-AO";
}
