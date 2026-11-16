import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Suporte dos E2E da A4 — instância Supabase LOCAL ISOLADA (`kilvora_e2e_a4`, 127.0.0.1:55321).
 * Só a chave publishable e credenciais SINTÉTICAS (fixtures da preparação); nunca chaves
 * privilegiadas. Consultas à base só em leitura, no contentor isolado.
 */

export const A4_PROJECT_ID = "kilvora_e2e_a4";
export const A4_DB_CONTAINER = `supabase_db_${A4_PROJECT_ID}`;
export const A4_API_URL = "http://127.0.0.1:55321";
export const MAIN_DB_CONTAINER = "supabase_db_Kilvora_Group_Website";

export type StaffFixture = {
  readonly email: string;
  readonly password: string;
  readonly userId: string;
  readonly totpSecret?: string;
};

export type A4Fixtures = {
  readonly runId: string;
  readonly apiUrl: string;
  readonly publishableKey: string;
  readonly mailpitUrl: string;
  readonly admin: StaffFixture;
  readonly op1: StaffFixture;
  readonly op2: StaffFixture;
};

export function loadFixtures(): A4Fixtures {
  const file = process.env.E2E_A4_FIXTURES;
  if (!file || !existsSync(file)) {
    throw new Error("E2E A4: fixtures em falta (executar primeiro e2e-portal-a4/prepare.ts).");
  }
  const fixtures = JSON.parse(readFileSync(file, "utf8")) as A4Fixtures;
  if (fixtures.apiUrl !== A4_API_URL) throw new Error("E2E A4: a API não é a instância isolada.");
  if (!/^sb_publishable_/.test(fixtures.publishableKey)) {
    throw new Error("E2E A4: só a chave publishable é aceite.");
  }
  return fixtures;
}

function dockerBinary(): string {
  const local = process.env.LOCALAPPDATA;
  const path = local && join(local, "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
  return path && existsSync(path) ? path : "docker";
}

/** Consulta SÓ DE LEITURA num contentor de base local (`default_transaction_read_only`). */
export function readOnly(container: string, sql: string): string {
  return execFileSync(
    dockerBinary(),
    [
      "exec",
      "-i",
      "-e",
      "PGOPTIONS=-c default_transaction_read_only=on",
      container,
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

export const STATE_SQL = `
select 'users', count(*) from auth.users union all
select 'factors_verified', count(*) from auth.mfa_factors where status = 'verified' union all
select 'profiles_interno', count(*) from public.profiles where kind = 'interno' union all
select 'roles_active', count(*) from public.user_roles where revoked_at is null union all
select 'bootstrap', count(*) from private.system_bootstrap union all
select 'tickets', count(*) from public.tickets union all
select 'ticket_events', count(*) from public.ticket_events union all
select 'ticket_messages', count(*) from public.ticket_messages union all
select 'ticket_internal_notes', count(*) from public.ticket_internal_notes union all
select 'audit_log', count(*) from private.audit_log;`;

export function counts(container: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of readOnly(container, STATE_SQL).split(/\r?\n/)) {
    const [key, value] = line.split("=");
    if (key) out[key] = Number(value);
  }
  return out;
}

export const REG0 = {
  id: "66e5d370-85b1-4cc2-a47c-9da6a44e25fa",
  fingerprint: "cliente|activo|25b60d982b349dfa91281f1a42fe19c9|909174fb44dc71502f441b7d0b455556",
};

export function mainReg0Fingerprint(): string {
  return readOnly(
    MAIN_DB_CONTAINER,
    `select p.kind || '|' || p.status || '|' || md5(row(p.*)::text) || '|' || md5(row(a.*)::text)
       from public.profiles p join public.accounts a on a.created_by = p.id
      where p.id = '${REG0.id}';`,
  );
}

// --- TOTP (RFC 6238: SHA-1, 30 s, 6 algarismos), sem dependências --------------------------
function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("TOTP: segredo inválido.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const lastStep = new Map<string, number>();

/** Código num período ainda não usado para este segredo (evita reutilizar um código). */
export async function freshTotp(secret: string): Promise<string> {
  const step = () => Math.floor(Date.now() / 1000 / 30);
  while ((lastStep.get(secret) ?? -1) >= step() || Date.now() / 1000 - step() * 30 > 27) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  lastStep.set(secret, step());
  return totp(secret);
}

// --- API directa (chave publishable + sessão do utilizador) --------------------------------
export async function api(
  fixtures: A4Fixtures,
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${fixtures.apiUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: fixtures.publishableKey,
      authorization: `Bearer ${init.token ?? fixtures.publishableKey}`,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // texto simples
  }
  return { status: response.status, body };
}

export async function passwordToken(
  fixtures: A4Fixtures,
  email: string,
  password: string,
): Promise<string> {
  const result = await api(fixtures, "/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  const token = (result.body as { access_token?: string }).access_token;
  if (!token) throw new Error(`E2E A4: entrada falhou (${result.status}).`);
  return token;
}

/** Sessão `aal2` pela API: palavra-passe + código TOTP do factor verificado. */
export async function aal2Token(fixtures: A4Fixtures, staff: StaffFixture): Promise<string> {
  if (!staff.totpSecret) throw new Error("E2E A4: sem segredo TOTP.");
  const token = await passwordToken(fixtures, staff.email, staff.password);
  const user = await api(fixtures, "/auth/v1/user", { token });
  const factors = (user.body as { factors?: { id: string; status: string }[] }).factors ?? [];
  const factor = factors.find((item) => item.status === "verified");
  if (!factor) throw new Error("E2E A4: sem factor verificado.");
  const challenge = await api(fixtures, `/auth/v1/factors/${factor.id}/challenge`, {
    method: "POST",
    token,
    body: {},
  });
  const verified = await api(fixtures, `/auth/v1/factors/${factor.id}/verify`, {
    method: "POST",
    token,
    body: {
      challenge_id: (challenge.body as { id: string }).id,
      code: await freshTotp(staff.totpSecret),
    },
  });
  const aal2 = (verified.body as { access_token?: string }).access_token;
  if (!aal2) throw new Error(`E2E A4: verificação TOTP falhou (${verified.status}).`);
  return aal2;
}
