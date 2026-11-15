import { isPortalEnabled } from "@/config/portal";

/**
 * Barreira do interruptor do portal para Server Actions e Route Handlers.
 *
 * Uma Server Action pode ser invocada por POST mesmo que a página correspondente dê 404; por
 * isso cada acção do portal deve chamar `assertPortalEnabled()` antes de qualquer outra
 * operação (incluindo criar o cliente Supabase). A mensagem é neutra e não revela
 * configuração.
 */
export class PortalDisabledError extends Error {
  constructor() {
    super("Portal indisponível.");
    this.name = "PortalDisabledError";
  }
}

export function assertPortalEnabled(): void {
  if (!isPortalEnabled()) throw new PortalDisabledError();
}
