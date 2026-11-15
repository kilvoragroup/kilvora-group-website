import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { EVIDENCE_DIR } from "./global-setup";
import { syntheticUserCount, tableCounts } from "./support/db";

/**
 * Fim dos E2E do portal — SÓ LEITURA. Não apaga nada.
 *
 * Compara as contagens com a referência e regista o resíduo esperado (contas sintéticas e
 * linhas imutáveis de `private.audit_log`). A limpeza é um passo separado, manual e autorizado
 * (`e2e-portal/sql/cleanup.sql`, decisão D-B).
 */
export default async function globalTeardown() {
  const baselineFile = join(EVIDENCE_DIR, "baseline.json");
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
    syntheticUsers: syntheticUserCount(),
    delta,
    cleanup: "Pendente: executar e2e-portal/sql/cleanup.sql apenas com autorização (D-B).",
  };
  writeFileSync(join(EVIDENCE_DIR, "integrity.json"), JSON.stringify(report, null, 2));
  console.log(
    `[E2E portal] contas sintéticas: ${report.syntheticUsers}; diferenças: ${JSON.stringify(delta)}`,
  );
}
