import { type LocalizedText, v } from "@/content/types";

/**
 * Tradução de erros da base (SQLSTATE das RPCs/RLS da M1–M3) e do PostgREST para mensagens
 * neutras pt-AO/pt-BR.
 *
 * Regras:
 * - Nunca devolver `message`, `details` ou `hint` originais: só um `kind`, um `reason` de uma
 *   lista fechada e um texto fixo.
 * - `PT404` é sempre «não encontrado» neutro: não distingue «inexistente» de «sem acesso» nem
 *   revela recursos de outras contas.
 * - Códigos desconhecidos dão um erro genérico.
 */

export type PortalErrorKind =
  | "not_found"
  | "conflict"
  | "business_rule"
  | "rate_limited"
  | "invalid_input"
  | "forbidden"
  | "integrity"
  | "session_expired"
  | "unavailable"
  | "unexpected";

/** Motivos específicos conhecidos (mensagens das RPCs não administrativas da M2). */
export type PortalErrorReason =
  | "status_conflict"
  | "ticket_closed"
  | "transition_not_allowed"
  | "reason_required"
  | "evidence_required"
  | "too_many_open_tickets"
  | "invalid_type"
  | "invalid_subject"
  | "invalid_description"
  | "invalid_body"
  | "invalid_reason"
  | "invalid_evidence_ref";

export type PortalError = {
  readonly kind: PortalErrorKind;
  readonly reason: PortalErrorReason | null;
  readonly message: LocalizedText;
  readonly retryable: boolean;
};

const KIND_BY_SQLSTATE: Readonly<Record<string, PortalErrorKind>> = {
  PT404: "not_found",
  PT409: "conflict",
  PT422: "business_rule",
  PT429: "rate_limited",
  "22023": "invalid_input",
  "42501": "forbidden",
  "23514": "integrity",
  "23502": "integrity",
};

/** Códigos do PostgREST relevantes; os restantes `PGRST*` caem no genérico. */
const KIND_BY_POSTGREST: Readonly<Record<string, PortalErrorKind>> = {
  PGRST116: "not_found", // `.single()` sem linhas: também neutro
  PGRST301: "session_expired",
  PGRST303: "session_expired",
};

const KIND_MESSAGES: Readonly<Record<PortalErrorKind, LocalizedText>> = {
  not_found: v("Não encontrámos o que procura.", "Não encontramos o que você procura."),
  conflict: v(
    "Esta operação entra em conflito com o estado actual. Actualize a página e tente novamente.",
    "Esta operação entra em conflito com o estado atual. Atualize a página e tente novamente.",
  ),
  business_rule: v(
    "Esta operação não é permitida neste momento.",
    "Esta operação não é permitida neste momento.",
  ),
  rate_limited: v(
    "Fez demasiados pedidos seguidos. Aguarde um pouco e tente novamente.",
    "Você fez muitas solicitações seguidas. Aguarde um pouco e tente novamente.",
  ),
  invalid_input: v(
    "Alguns dados não são válidos. Reveja-os e tente novamente.",
    "Alguns dados não são válidos. Revise-os e tente novamente.",
  ),
  forbidden: v(
    "Não tem permissão para esta operação, ou a sessão terminou.",
    "Você não tem permissão para esta operação, ou a sessão terminou.",
  ),
  integrity: v(
    "Não foi possível concluir a operação com estes dados.",
    "Não foi possível concluir a operação com esses dados.",
  ),
  session_expired: v(
    "A sua sessão expirou. Entre novamente.",
    "Sua sessão expirou. Entre novamente.",
  ),
  unavailable: v(
    "O serviço está temporariamente indisponível. Tente novamente dentro de instantes.",
    "O serviço está temporariamente indisponível. Tente novamente em instantes.",
  ),
  unexpected: v(
    "Ocorreu um erro inesperado. Tente novamente.",
    "Ocorreu um erro inesperado. Tente novamente.",
  ),
};

/** Motivo → código esperado e texto. Só é usado quando o SQLSTATE coincide. */
const REASONS: Readonly<
  Record<PortalErrorReason, { readonly code: string; readonly message: LocalizedText }>
> = {
  status_conflict: {
    code: "PT409",
    message: v(
      "O pedido foi alterado entretanto. Actualize a página e tente novamente.",
      "O pedido foi alterado nesse meio-tempo. Atualize a página e tente novamente.",
    ),
  },
  ticket_closed: {
    code: "PT409",
    message: v("Este pedido já está encerrado.", "Este pedido já está encerrado."),
  },
  transition_not_allowed: {
    code: "PT422",
    message: v(
      "Esta mudança de estado não é permitida.",
      "Esta mudança de status não é permitida.",
    ),
  },
  reason_required: {
    code: "PT422",
    message: v("Indique o motivo.", "Informe o motivo."),
  },
  evidence_required: {
    code: "PT422",
    message: v("Indique a referência da evidência.", "Informe a referência da evidência."),
  },
  too_many_open_tickets: {
    code: "PT429",
    message: v(
      "Atingiu o limite de pedidos em aberto. Aguarde a conclusão de algum antes de criar outro.",
      "Você atingiu o limite de pedidos em aberto. Aguarde a conclusão de algum antes de criar outro.",
    ),
  },
  invalid_type: {
    code: "22023",
    message: v("Escolha o tipo de pedido.", "Escolha o tipo de pedido."),
  },
  invalid_subject: {
    code: "22023",
    message: v(
      "O assunto deve ter entre 3 e 160 caracteres.",
      "O assunto deve ter entre 3 e 160 caracteres.",
    ),
  },
  invalid_description: {
    code: "22023",
    message: v(
      "A descrição deve ter entre 10 e 5000 caracteres.",
      "A descrição deve ter entre 10 e 5000 caracteres.",
    ),
  },
  invalid_body: {
    code: "22023",
    message: v(
      "A mensagem deve ter entre 1 e 5000 caracteres.",
      "A mensagem deve ter entre 1 e 5000 caracteres.",
    ),
  },
  invalid_reason: {
    code: "22023",
    message: v(
      "O motivo pode ter no máximo 1000 caracteres.",
      "O motivo pode ter no máximo 1000 caracteres.",
    ),
  },
  invalid_evidence_ref: {
    code: "22023",
    message: v(
      "A referência da evidência pode ter no máximo 300 caracteres.",
      "A referência da evidência pode ter no máximo 300 caracteres.",
    ),
  },
};

const RETRYABLE: ReadonlySet<PortalErrorKind> = new Set([
  "rate_limited",
  "unavailable",
  "conflict",
]);

function build(kind: PortalErrorKind, reason: PortalErrorReason | null = null): PortalError {
  return {
    kind,
    reason,
    message: reason ? REASONS[reason].message : KIND_MESSAGES[kind],
    retryable: RETRYABLE.has(kind),
  };
}

function readString(source: object, key: string): string | null {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function isNetworkFailure(error: object): boolean {
  if (error instanceof TypeError) return true; // `fetch` falhado
  const name = readString(error, "name");
  return name === "AbortError" || name === "TimeoutError";
}

/** Converte qualquer erro (PostgrestError, erro de rede, desconhecido) num `PortalError`. */
export function mapPortalError(error: unknown): PortalError {
  if (!error || typeof error !== "object") return build("unexpected");
  if (isNetworkFailure(error)) return build("unavailable");

  const code = readString(error, "code");
  if (!code) return build("unexpected");

  const postgrestKind = KIND_BY_POSTGREST[code];
  if (postgrestKind) return build(postgrestKind);

  const kind = KIND_BY_SQLSTATE[code];
  if (!kind) return build("unexpected");

  // O `message` da base só é usado como chave numa lista fechada; nunca é devolvido.
  const raw = readString(error, "message");
  if (raw && Object.hasOwn(REASONS, raw)) {
    const reason = raw as PortalErrorReason;
    if (REASONS[reason].code === code) return build(kind, reason);
  }
  return build(kind);
}
