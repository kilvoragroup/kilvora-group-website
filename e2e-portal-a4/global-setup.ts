import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  A4_DB_CONTAINER,
  MAIN_DB_CONTAINER,
  REG0,
  counts,
  loadFixtures,
  mainReg0Fingerprint,
} from "./support";

/**
 * Preparação dos E2E da A4 — SÓ LEITURA. Exige `E2E_PORTAL_RUN=1`, fixtures da instância
 * isolada e confirma: D13 concluído só na instância isolada (1 arranque), base principal sem
 * arranque e REG0 intacta. Regista as contagens de referência das duas bases.
 */
export const A4_EVIDENCE_DIR = join(process.cwd(), "e2e-portal-results", "evidence-a4");

export default async function globalSetup() {
  if (process.env.E2E_PORTAL_RUN !== "1") {
    throw new Error("E2E A4: executar só com autorização expressa (E2E_PORTAL_RUN=1).");
  }
  loadFixtures();
  const isolated = counts(A4_DB_CONTAINER);
  const main = counts(MAIN_DB_CONTAINER);
  if (isolated.bootstrap !== 1 || isolated.tickets !== 0) {
    throw new Error("E2E A4: a instância isolada não está no estado preparado.");
  }
  if (main.bootstrap !== 0) throw new Error("E2E A4: a base principal tem arranque D13.");
  if (mainReg0Fingerprint() !== REG0.fingerprint) throw new Error("E2E A4: REG0 alterada.");

  mkdirSync(A4_EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(A4_EVIDENCE_DIR, "baseline.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), isolated, main }, null, 2),
  );
}
