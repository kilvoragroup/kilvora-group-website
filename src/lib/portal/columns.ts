/**
 * Listas explícitas de colunas para as leituras sob a RLS da M3. Nunca usar `select("*")`.
 *
 * `ticket_events` tem um contrato por colunas (Q1): a M3 concede SELECT só a estas nove, sem
 * `evidence_ref`. `evidence_ref` só é obtido pela RPC `staff_ticket_events`, na consola.
 *
 * As listas são literais para que o cliente Supabase tipado as verifique contra
 * `database.types.ts` em tempo de compilação.
 */

export const PROFILE_VIEWER_COLUMNS = "id, kind, status, full_name, locale" as const;

export const PROFILE_COLUMNS =
  "id, kind, status, full_name, phone, locale, created_at, updated_at" as const;

export const USER_ROLE_ACTIVE_COLUMNS = "role" as const;

export const ACCOUNT_COLUMNS =
  "id, name, country, sector, status, created_by, created_at, updated_at" as const;

export const ACCOUNT_MEMBER_COLUMNS = "account_id, user_id, member_role, created_at" as const;

export const TICKET_COLUMNS =
  "id, reference, account_id, requester_id, type, subject, description, status, assigned_operator_id, created_at, updated_at, closed_at" as const;

export const TICKET_MESSAGE_COLUMNS = "id, ticket_id, author_id, body, created_at" as const;

export const TICKET_INTERNAL_NOTE_COLUMNS = "id, ticket_id, author_id, body, created_at" as const;

/** As nove colunas de `ticket_events` concedidas pela M3 (Q1). */
export const TICKET_EVENT_COLUMN_NAMES = [
  "id",
  "ticket_id",
  "actor_id",
  "event_type",
  "from_status",
  "to_status",
  "reason",
  "visibility",
  "created_at",
] as const;

export const TICKET_EVENT_COLUMNS =
  "id, ticket_id, actor_id, event_type, from_status, to_status, reason, visibility, created_at" as const;

/** Separa uma lista de colunas em nomes (uso em testes e verificações). */
export function columnNames(list: string): string[] {
  return list.split(",").map((name) => name.trim());
}
