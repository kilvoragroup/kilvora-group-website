import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { syntheticUserCount, tableCounts } from "./support/db";
import { loadLocalSupabase } from "./support/local-supabase";

/**
 * Evidências de integridade (contagens antes/depois). Pasta irmã da `outputDir` do portal, para
 * não ser apagada pela limpeza do Playwright; fora das pastas da suite institucional.
 */
export const EVIDENCE_DIR = join(process.cwd(), "e2e-portal-results", "evidence");

/**
 * Preparação dos E2E do portal — SÓ LEITURA.
 *
 * 1. Exige autorização explícita (`E2E_PORTAL_RUN=1`): estes testes criam contas sintéticas
 *    na base LOCAL.
 * 2. Confirma que o Supabase é local (loopback).
 * 3. Recusa arrancar se já existirem contas `@e2e.example.test` (limpeza anterior em falta).
 * 4. Regista a referência: contagens das tabelas do portal e do Auth.
 */
export default async function globalSetup() {
  if (process.env.E2E_PORTAL_RUN !== "1") {
    throw new Error(
      "E2E do portal: criam contas sintéticas na base LOCAL. Executar só com autorização " +
        "expressa, definindo E2E_PORTAL_RUN=1.",
    );
  }
  loadLocalSupabase();

  const existing = syntheticUserCount();
  if (existing > 0) {
    throw new Error(
      `E2E do portal: existem ${existing} contas sintéticas de execuções anteriores. ` +
        "Executar primeiro a limpeza autorizada (e2e-portal/sql/cleanup.sql).",
    );
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, "baseline.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), counts: tableCounts() }, null, 2),
  );
}
