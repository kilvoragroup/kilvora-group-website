import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  A4_DB_CONTAINER,
  MAIN_DB_CONTAINER,
  REG0,
  counts,
  loadFixtures,
  mainReg0Fingerprint,
} from "../e2e-portal-a4/support";

/**
 * Preparação dos E2E da A5 — SÓ LEITURA. Instância isolada própria (`E2E_ISOLATED_PROJECT_ID`,
 * por exemplo `kilvora_e2e_a5`), já preparada por `e2e-portal-a4/prepare.ts`. Confirma D13 só
 * nessa instância, base principal sem arranque e REG0 intacta.
 */
export const A5_EVIDENCE_DIR = join(process.cwd(), "e2e-portal-results", "evidence-a5");

export default async function globalSetup() {
  if (process.env.E2E_PORTAL_RUN !== "1") {
    throw new Error("E2E A5: executar só com autorização expressa (E2E_PORTAL_RUN=1).");
  }
  if (A4_DB_CONTAINER === "supabase_db_kilvora_e2e_a4" || A4_DB_CONTAINER === MAIN_DB_CONTAINER) {
    throw new Error("E2E A5: indicar a instância isolada própria (E2E_ISOLATED_PROJECT_ID).");
  }
  loadFixtures();
  const isolated = counts(A4_DB_CONTAINER);
  const main = counts(MAIN_DB_CONTAINER);
  if (isolated.bootstrap !== 1 || isolated.tickets !== 0) {
    throw new Error("E2E A5: a instância isolada não está no estado preparado.");
  }
  if (main.bootstrap !== 0) throw new Error("E2E A5: a base principal tem arranque D13.");
  if (mainReg0Fingerprint() !== REG0.fingerprint) throw new Error("E2E A5: REG0 alterada.");
  mkdirSync(A5_EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(A5_EVIDENCE_DIR, "baseline.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), isolated, main }, null, 2),
  );
}
