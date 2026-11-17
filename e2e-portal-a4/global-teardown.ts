import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { A4_EVIDENCE_DIR } from "./global-setup";
import { A4_DB_CONTAINER, MAIN_DB_CONTAINER, REG0, counts, mainReg0Fingerprint } from "./support";

/** Fim dos E2E da A4 — SÓ LEITURA. Regista as diferenças e a integridade da base principal. */
export default async function globalTeardown() {
  const file = join(A4_EVIDENCE_DIR, "baseline.json");
  if (!existsSync(file)) return;
  const baseline = JSON.parse(readFileSync(file, "utf8")) as {
    isolated: Record<string, number>;
    main: Record<string, number>;
  };
  const diff = (before: Record<string, number>, after: Record<string, number>) =>
    Object.fromEntries(
      Object.keys(after)
        .map((key) => [key, after[key] - (before[key] ?? 0)] as const)
        .filter(([, value]) => value !== 0),
    );
  const isolated = counts(A4_DB_CONTAINER);
  const main = counts(MAIN_DB_CONTAINER);
  const report = {
    finishedAt: new Date().toISOString(),
    isolatedDelta: diff(baseline.isolated, isolated),
    mainDelta: diff(baseline.main, main),
    reg0Intact: mainReg0Fingerprint() === REG0.fingerprint,
  };
  writeFileSync(join(A4_EVIDENCE_DIR, "integrity.json"), JSON.stringify(report, null, 2));
  console.log(`[E2E A4] ${JSON.stringify(report)}`);
}
