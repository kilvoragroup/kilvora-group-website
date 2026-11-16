import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tableCounts } from "../e2e-portal/support/db";

import { A3_EVIDENCE_DIR, REG0, reg0Fingerprint, syntheticAccounts } from "./global-setup";

/**
 * Fim dos E2E da A3 — SÓ LEITURA. Não apaga nada (os pedidos, eventos e mensagens são
 * imutáveis; resíduo aceite na base LOCAL). Regista as diferenças de contagens, as contas
 * sintéticas por execução (sem e-mails) e a integridade da REG0.
 */
export default async function globalTeardown() {
  const baselineFile = join(A3_EVIDENCE_DIR, "baseline.json");
  if (!existsSync(baselineFile)) return;

  const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as {
    counts: Record<string, number>;
  };
  const after = tableCounts();
  const delta = Object.fromEntries(
    Object.keys(after)
      .map((table) => [table, after[table] - (baseline.counts[table] ?? 0)] as const)
      .filter(([, value]) => value !== 0),
  );
  const report = {
    finishedAt: new Date().toISOString(),
    syntheticAccounts: syntheticAccounts(),
    reg0Intact: reg0Fingerprint() === REG0.fingerprint,
    delta,
    cleanup: "Resíduo A3 imutável aceite na base local (A3-FINAL); nada é apagado.",
  };
  writeFileSync(join(A3_EVIDENCE_DIR, "integrity.json"), JSON.stringify(report, null, 2));
  console.log(`[E2E A3] REG0 intacta: ${report.reg0Intact}; diferenças: ${JSON.stringify(delta)}`);
}
