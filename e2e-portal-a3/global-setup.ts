import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readOnlyQuery, tableCounts } from "../e2e-portal/support/db";
import { loadLocalSupabase } from "../e2e-portal/support/local-supabase";

/**
 * Preparação dos E2E da A3 — SÓ LEITURA. Própria da A3 (decisão A3-FINAL-R3, opção B): a
 * infraestrutura E2E da A2 (`e2e-portal/global-setup.ts`) não é usada nem alterada.
 *
 * 1. Exige autorização explícita (`E2E_PORTAL_RUN=1`) e Supabase local (loopback).
 * 2. Aceita SÓ os resíduos sintéticos A3 já identificados (contas com pedidos imutáveis, que a
 *    limpeza D-B não remove). Qualquer outra conta sintética → recusa (limpeza em falta ou
 *    resíduo não registado). As novas contas usam um identificador de execução novo.
 * 3. Confirma a REG0 (perfil e conta inalterados).
 * 4. Regista a referência (contagens) para o `globalTeardown` da A3.
 */

export const A3_EVIDENCE_DIR = join(process.cwd(), "e2e-portal-results", "evidence-a3");

/** Execuções A3 cujo resíduo imutável foi aceite (2 contas cada: `a3a`, `a3b`). */
export const ACCEPTED_A3_RESIDUE_RUNS: readonly string[] = [
  "mwi4xunt4184ba", // A3-FINAL-R2 (3/9, falha de sincronização do teste)
  "mwikv3sg68b85c", // A3-FINAL-R3 (9/9 PASS)
];

/** REG0: utilizador local de referência e impressões md5 do perfil e da conta. */
export const REG0 = {
  id: "66e5d370-85b1-4cc2-a47c-9da6a44e25fa",
  fingerprint: "cliente|activo|25b60d982b349dfa91281f1a42fe19c9|909174fb44dc71502f441b7d0b455556",
};

export function reg0Fingerprint(): string {
  return readOnlyQuery(
    `select p.kind || '|' || p.status || '|' || md5(row(p.*)::text) || '|' || md5(row(a.*)::text)
       from public.profiles p join public.accounts a on a.created_by = p.id
      where p.id = '${REG0.id}';`,
  );
}

/** Contas sintéticas: (execução, rótulo, n.º de pedidos). Nunca devolve e-mails completos. */
export function syntheticAccounts(): { run: string; label: string; tickets: number }[] {
  const output = readOnlyQuery(
    `select split_part(split_part(u.email, '@', 1), '-', 2), split_part(split_part(u.email, '@', 1), '-', 3),
            (select count(*) from public.tickets t where t.requester_id = u.id)
       from auth.users u where u.email like '%@e2e.example.test' order by 1, 2;`,
  );
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [run, label, tickets] = line.split("=");
      return { run, label, tickets: Number(tickets) };
    });
}

export function isAcceptedResidue(account: { run: string; label: string; tickets: number }) {
  return (
    ACCEPTED_A3_RESIDUE_RUNS.includes(account.run) &&
    (account.label === "a3a" || account.label === "a3b") &&
    account.tickets > 0
  );
}

export default async function globalSetup() {
  if (process.env.E2E_PORTAL_RUN !== "1") {
    throw new Error(
      "E2E A3: criam contas e pedidos sintéticos IMUTÁVEIS na base LOCAL. Executar só com " +
        "autorização expressa, definindo E2E_PORTAL_RUN=1.",
    );
  }
  loadLocalSupabase();

  const accounts = syntheticAccounts();
  const unexpected = accounts.filter((account) => !isAcceptedResidue(account));
  if (unexpected.length > 0) {
    throw new Error(
      `E2E A3: ${unexpected.length} conta(s) sintética(s) fora do resíduo A3 aceite. ` +
        "Execução recusada (limpeza em falta ou resíduo não registado).",
    );
  }
  if (reg0Fingerprint() !== REG0.fingerprint) {
    throw new Error("E2E A3: a REG0 não corresponde à impressão registada. Execução recusada.");
  }

  mkdirSync(A3_EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(A3_EVIDENCE_DIR, "baseline.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        acceptedResidueAccounts: accounts.length,
        counts: tableCounts(),
      },
      null,
      2,
    ),
  );
}
