/**
 * Preparação do pessoal SINTÉTICO dos E2E da A4 — só na instância Supabase LOCAL ISOLADA
 * (`project_id = kilvora_e2e_a4`, API em 127.0.0.1:55321). Nunca na instância principal
 * (REG0) nem no Supabase alojado. Executar uma vez, com autorização expressa:
 *
 *   $env:E2E_A4_WORKDIR = "<pasta com supabase/config.toml da instância isolada>"
 *   $env:E2E_A4_FIXTURES = "<ficheiro JSON fora do repositório>"
 *   node e2e-portal-a4/prepare.ts
 *
 * Passos (procedimento da secção 4.2 do documento de engenharia, com os scripts `supabase/ops`):
 * 1. Guardas: instância isolada, D13 por usar, base vazia.
 * 2. Arranque D13: fase A (provisionamento) → convite pelo Auth → palavra-passe e e-mail
 *    confirmado → TOTP verificado → fase B (papel `admin`).
 * 3. Admin (aal2): `admin_provision_staff` → convite → TOTP (só op2) → `grant_role('operador')`.
 *    O op1 recebe o papel SEM TOTP (F6, inofensivo sem aal2) para o E2E testar a inscrição.
 *
 * A chave privilegiada (service role) é lida de `supabase status` só neste processo, em memória,
 * para os convites e para definir a palavra-passe; nunca é escrita, registada nem passada aos
 * testes. O ficheiro de fixtures contém só credenciais SINTÉTICAS desta instância descartável.
 */
import { execFileSync, execSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ID = "kilvora_e2e_a4";
const DB_CONTAINER = `supabase_db_${PROJECT_ID}`;
const API_URL = "http://127.0.0.1:55321";
const DOMAIN = "e2e.example.test";

function fail(message: string): never {
  throw new Error(`Preparação A4: ${message}`);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`variável ${name} em falta.`);
  return value;
}

function dockerBinary(): string {
  const local = process.env.LOCALAPPDATA;
  return local
    ? join(local, "Programs", "DockerDesktop", "resources", "bin", "docker.exe")
    : "docker";
}

/** SQL na instância ISOLADA, como postgres (só preparação; ficheiro ou texto por stdin). */
function psql(sql: string, vars: Record<string, string> = {}): string {
  const args = ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X"];
  args.push("-q", "-A", "-t", "-v", "ON_ERROR_STOP=1");
  for (const [key, value] of Object.entries(vars)) args.push("-v", `${key}=${value}`);
  args.push("-f", "-");
  return execFileSync(dockerBinary(), args, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

type Status = { apiUrl: string; publishableKey: string; serviceKey: string; mailpitUrl: string };

function readStatus(workdir: string): Status {
  const output = execSync(`npx supabase status --workdir "${workdir}" -o env`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) values.set(match[1], match[2].replace(/^"|"$/g, ""));
  }
  const status = {
    apiUrl: values.get("API_URL") ?? "",
    publishableKey: values.get("PUBLISHABLE_KEY") ?? "",
    serviceKey: values.get("SERVICE_ROLE_KEY") ?? "",
    mailpitUrl: values.get("MAILPIT_URL") ?? "",
  };
  if (status.apiUrl !== API_URL) fail("a API não é a instância isolada (127.0.0.1:55321).");
  if (!/^sb_publishable_/.test(status.publishableKey) || !status.serviceKey) {
    fail("chaves locais em falta.");
  }
  return status;
}

// --- TOTP (RFC 6238: SHA-1, 30 s, 6 algarismos) --------------------------------------------
function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) fail("segredo TOTP inválido.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

// --- Auth (GoTrue) --------------------------------------------------------------------------
async function call(
  path: string,
  init: { method: string; key: string; bearer?: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      apikey: init.key,
      authorization: `Bearer ${init.bearer ?? init.key}`,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  if (!response.ok) fail(`${init.method} ${path} → ${response.status}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

const syntheticPassword = () => `Kg1a${randomBytes(18).toString("base64url")}`;

type Staff = { email: string; password: string; userId: string; totpSecret?: string };

async function inviteAndActivate(status: Status, email: string): Promise<Staff> {
  const invited = await call("/auth/v1/invite", {
    method: "POST",
    key: status.serviceKey,
    body: { email },
  });
  const userId = String(invited.id ?? "");
  if (!userId) fail("convite sem id.");
  const password = syntheticPassword();
  await call(`/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    key: status.serviceKey,
    body: { password, email_confirm: true },
  });
  const kind = psql(`select kind from public.profiles where id = '${userId}';`);
  if (kind !== "interno") fail("o convite não foi classificado como interno (F2).");
  return { email, password, userId };
}

async function signIn(status: Status, staff: Staff): Promise<string> {
  const session = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: status.publishableKey,
    body: { email: staff.email, password: staff.password },
  });
  return String(session.access_token);
}

/** Inscreve e verifica TOTP; devolve o token `aal2`. */
async function enrollTotp(status: Status, staff: Staff): Promise<string> {
  const token = await signIn(status, staff);
  const factor = await call("/auth/v1/factors", {
    method: "POST",
    key: status.publishableKey,
    bearer: token,
    body: { factor_type: "totp", friendly_name: "Consola KILVORA" },
  });
  const factorId = String(factor.id);
  const secret = String((factor.totp as Record<string, unknown>).secret);
  const challenge = await call(`/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    key: status.publishableKey,
    bearer: token,
    body: {},
  });
  const verified = await call(`/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    key: status.publishableKey,
    bearer: token,
    body: { challenge_id: challenge.id, code: totp(secret) },
  });
  staff.totpSecret = secret;
  return String(verified.access_token);
}

async function rpc(status: Status, token: string, fn: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${API_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: status.publishableKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) fail(`rpc ${fn} → ${response.status}`);
  return response.json();
}

async function main() {
  const workdir = requiredEnv("E2E_A4_WORKDIR");
  const fixturesFile = requiredEnv("E2E_A4_FIXTURES");
  if (process.env.E2E_PORTAL_RUN !== "1") fail("exige E2E_PORTAL_RUN=1 (autorização expressa).");

  const status = readStatus(workdir);
  const guard = psql(
    `select (select count(*) from private.system_bootstrap) || '|' ||
            (select count(*) from public.user_roles where role = 'admin') || '|' ||
            (select count(*) from auth.users);`,
  );
  if (guard !== "0|0|0") fail(`instância não está no estado inicial (${guard}).`);

  const runId = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const email = (label: string) => `e2e-${runId}-${label}@${DOMAIN}`;

  // D13 — fase A, convite, TOTP, fase B.
  const opsDir = join(process.cwd(), "supabase", "ops");
  psql(readFileSync(join(opsDir, "bootstrap_admin_1_provision.sql"), "utf8"), {
    email: email("adm"),
  });
  const admin = await inviteAndActivate(status, email("adm"));
  await enrollTotp(status, admin);
  psql(readFileSync(join(opsDir, "bootstrap_admin_2_grant.sql"), "utf8"));
  // Nova sessão aal2 do admin já com o papel activo.
  await new Promise((resolve) => setTimeout(resolve, 31_000)); // código TOTP novo
  const adminToken = await (async () => {
    const token = await signIn(status, admin);
    const factors = await call("/auth/v1/user", {
      method: "GET",
      key: status.publishableKey,
      bearer: token,
    });
    const factorId = String((factors.factors as Record<string, unknown>[])[0].id);
    const challenge = await call(`/auth/v1/factors/${factorId}/challenge`, {
      method: "POST",
      key: status.publishableKey,
      bearer: token,
      body: {},
    });
    const verified = await call(`/auth/v1/factors/${factorId}/verify`, {
      method: "POST",
      key: status.publishableKey,
      bearer: token,
      body: { challenge_id: challenge.id, code: totp(admin.totpSecret ?? "") },
    });
    return String(verified.access_token);
  })();

  // Operadores: provisionamento pelo admin, convite, (TOTP do op2), papel.
  const operators: Record<string, Staff> = {};
  for (const label of ["op1", "op2"]) {
    await rpc(status, adminToken, "admin_provision_staff", { p_email: email(label) });
    const staff = await inviteAndActivate(status, email(label));
    if (label === "op2") await enrollTotp(status, staff);
    await rpc(status, adminToken, "grant_role", { p_user_id: staff.userId, p_role: "operador" });
    operators[label] = staff;
  }

  writeFileSync(
    fixturesFile,
    JSON.stringify(
      {
        runId,
        apiUrl: status.apiUrl,
        publishableKey: status.publishableKey,
        mailpitUrl: status.mailpitUrl,
        admin,
        op1: operators.op1,
        op2: operators.op2,
      },
      null,
      2,
    ),
  );
  console.log(
    `[Preparação A4] concluída: execução ${runId}; admin (D13) e 2 operadores sintéticos.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Preparação A4: erro.");
  process.exit(1);
});
