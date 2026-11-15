import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Consultas à base LOCAL dos E2E do portal — EXCLUSIVAMENTE em leitura.
 *
 * Cada execução força `default_transaction_read_only=on` (PGOPTIONS): qualquer escrita
 * acidental falha no PostgreSQL. A limpeza (escrita) NÃO está aqui: está em
 * `e2e-portal/sql/cleanup.sql` e só é executada à mão, mediante autorização (D-B).
 */

export const DB_CONTAINER = "supabase_db_Kilvora_Group_Website";

function dockerBinary(): string {
  if (process.env.DOCKER_BIN) return process.env.DOCKER_BIN;
  const candidates = [
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Programs", "DockerDesktop", "resources", "bin", "docker.exe"),
    process.env.ProgramFiles &&
      join(process.env.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe"),
  ].filter((value): value is string => typeof value === "string");
  return candidates.find((path) => existsSync(path)) ?? "docker";
}

export function readOnlyQuery(sql: string): string {
  return execFileSync(
    dockerBinary(),
    [
      "exec",
      "-i",
      "-e",
      "PGOPTIONS=-c default_transaction_read_only=on",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-A",
      "-t",
      "-F",
      "=",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 60_000 },
  ).trim();
}

/** Tabelas comparadas antes e depois (as mesmas da A2-B2-R2). */
export const COUNTED_TABLES = [
  "auth.users",
  "auth.identities",
  "auth.sessions",
  "auth.refresh_tokens",
  "auth.mfa_amr_claims",
  "auth.flow_state",
  "auth.one_time_tokens",
  "public.profiles",
  "public.accounts",
  "public.account_members",
  "public.user_roles",
  "public.tickets",
  "public.ticket_events",
  "public.ticket_messages",
  "public.ticket_internal_notes",
  "private.audit_log",
  "private.staff_provisioning",
  "supabase_migrations.schema_migrations",
] as const;

export function tableCounts(): Record<string, number> {
  const sql =
    COUNTED_TABLES.map((t) => `select '${t}', count(*) from ${t}`).join(" union all ") + ";";
  const counts: Record<string, number> = {};
  for (const line of readOnlyQuery(sql).split(/\r?\n/)) {
    const [table, value] = line.split("=");
    if (table) counts[table] = Number(value);
  }
  return counts;
}

/** Utilizadores sintéticos presentes (só a contagem; nunca os e-mails). */
export function syntheticUserCount(): number {
  return Number(
    readOnlyQuery("select count(*) from auth.users where email like '%@e2e.example.test';"),
  );
}
