import { randomBytes } from "node:crypto";

/**
 * Dados SINTÉTICOS dos E2E do portal (D07).
 *
 * - Domínio reservado `e2e.example.test` (RFC 2606/6761): nunca entrega correio real.
 * - Um identificador por execução separa as contas de execuções diferentes.
 * - Palavras-passe aleatórias, geradas em memória e nunca registadas.
 * - Nomes claramente fictícios.
 */

export const E2E_EMAIL_DOMAIN = "e2e.example.test";

export type SyntheticUser = {
  readonly label: string;
  readonly email: string;
  readonly fullName: string;
  readonly company: string;
  password: string;
};

/** Cumpre a política do Auth: ≥ 12 caracteres, minúscula, maiúscula e algarismo. */
export function syntheticPassword(): string {
  return `Kg1a${randomBytes(18).toString("base64url")}`;
}

export function newRun() {
  const runId = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  return {
    runId,
    user(label: string): SyntheticUser {
      return {
        label,
        email: `e2e-${runId}-${label}@${E2E_EMAIL_DOMAIN}`,
        fullName: `E2E Teste ${label.toUpperCase()}`,
        company: `E2E Empresa ${label.toUpperCase()}`,
        password: syntheticPassword(),
      };
    },
  };
}
