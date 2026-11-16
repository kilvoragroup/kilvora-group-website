import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";

import { newRun } from "../e2e-portal/support/data";
import { messageIds, waitForVerifyLink } from "../e2e-portal/support/mailpit";

import {
  type StaffFixture,
  aal2Token,
  api,
  freshTotp,
  loadFixtures,
  passwordToken,
} from "./support";

/**
 * E2E REAIS da consola interna e do MFA (A4) na instância Supabase LOCAL ISOLADA.
 *
 * Actores: cliente (registado aqui), admin (D13, TOTP na preparação), op1 (papel sem TOTP:
 * inscreve-se aqui), op2 (papel com TOTP). Pedidos: T1 (atribuído ao op1) e T2 (sem atribuição).
 * Só a chave publishable e credenciais sintéticas. Resíduo imutável aceite na instância isolada.
 */

test.describe.configure({ mode: "serial" });

const fx = loadFixtures();
const run = newRun();
const client = run.user("a4c");

const TEXT = {
  notFound: "Página não encontrada",
  mfaTitle: "Verificação em dois passos",
  consoleTitle: "Consola interna — pedidos",
  applied: "Estado actualizado.",
  sent: "Mensagem enviada.",
  noteAdded: "Nota interna adicionada.",
  evidenceRequired: "Indique a referência da evidência",
  empty: "Não há pedidos para mostrar.",
  unassigned: "Sem operador atribuído",
  team: "Equipa KILVORA",
};
const SUBJECT_T1 = `Website A4 ${run.runId}`;
const SUBJECT_T2 = `Consultoria A4 ${run.runId}`;
const NOTE = `NOTA-INTERNA-${run.runId}`;
const EVIDENCE = `PROP-E2E-${run.runId}`;
const STAFF_MESSAGE = `Estamos a preparar a proposta ${run.runId}.`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const state = { t1: "", t2: "" };
let clientContext: BrowserContext;

test.afterAll(async () => {
  await clientContext?.close();
});

async function waitStreamed(page: Page) {
  await expect(page.getByText("A carregar…")).toHaveCount(0);
}

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/cliente/entrar?next=${encodeURIComponent(next)}`);
  await page.locator("#entrar-email").fill(email);
  await page.locator("#entrar-palavra-passe").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Entrada de staff com TOTP já inscrito: entrada → /interno/mfa → código → consola. */
async function staffSignIn(browser: Browser, staff: StaffFixture): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, staff.email, staff.password, "/interno");
  await expect(page).toHaveURL(/\/interno\/mfa$/);
  await expect(page.getByRole("button", { name: "Gerar código QR" })).toHaveCount(0);
  await page.locator("#mfa-codigo").fill(await freshTotp(staff.totpSecret ?? ""));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/interno$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEXT.consoleTitle);
  return page;
}

async function expectNotFound(page: Page, path: string, hidden: string[]) {
  await page.goto(path);
  await waitStreamed(page);
  const body = await page.locator("main").innerText();
  expect(body).toContain(TEXT.notFound);
  for (const value of hidden) expect(body).not.toContain(value);
  expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBeGreaterThan(0);
}

async function createTicket(page: Page, type: string, subject: string, plan?: string) {
  await page.goto("/cliente/pedidos/novo");
  await page.locator("#pedido-tipo").selectOption(type);
  if (plan) await page.locator(`input[name="planId"][value="${plan}"]`).check();
  await page.locator("#pedido-assunto").fill(subject);
  await page.locator("#pedido-descricao").fill("Descrição sintética do pedido para os E2E da A4.");
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page).toHaveURL(/\/cliente\/pedidos\/[0-9a-f-]{36}\?aviso=criado$/);
  return UUID.exec(page.url())?.[0] ?? "";
}

async function transition(page: Page, to: string, label: string, evidence?: string) {
  await page.locator("#transicao-destino").selectOption(to);
  if (evidence !== undefined) await page.locator("#transicao-evidencia").fill(evidence);
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.locator("dl")).toContainText(label);
}

test("A4-01 · sem sessão: /interno exige entrada", async ({ page }) => {
  await page.goto("/interno");
  await expect(page).toHaveURL(/\/cliente\/entrar\?next=%2Finterno/);
});

test("A4-02 · cliente cria T1 (website) e T2; não acede à consola", async ({ browser }) => {
  clientContext = await browser.newContext();
  const page = await clientContext.newPage();
  const seen = await messageIds(fx.mailpitUrl, client.email);
  await page.goto("/cliente/criar-conta");
  await page.locator("#registo-nome").fill(client.fullName);
  await page.locator("#registo-empresa").fill(client.company);
  await page.locator("#registo-email").fill(client.email);
  await page.locator("#registo-palavra-passe").fill(client.password);
  await page.locator("#registo-confirmacao").fill(client.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.locator("#registo-mensagem")).toContainText("Pedido de registo recebido");
  const { link } = await waitForVerifyLink(fx.mailpitUrl, client.email, seen);
  await page.goto(link);
  await expect(page).toHaveURL(/\/cliente$/);

  state.t1 = await createTicket(page, "desenvolvimento_websites", SUBJECT_T1, "premium");
  state.t2 = await createTicket(page, "consultoria", SUBJECT_T2);
  expect(state.t1 && state.t2).toBeTruthy();

  await expectNotFound(page, "/interno", [SUBJECT_T1]);
  await expectNotFound(page, "/interno/mfa", []);
  await expectNotFound(page, `/interno/pedidos/${state.t1}`, [SUBJECT_T1]);
  await page.close();
});

test("A4-03 · admin (aal2, API) atribui T1 ao op1; sem aal2 a base nega", async () => {
  const aal1 = await passwordToken(fx, fx.admin.email, fx.admin.password);
  const denied = await api(fx, "/rest/v1/rpc/assign_ticket", {
    method: "POST",
    token: aal1,
    body: { p_ticket_id: state.t1, p_operator_id: fx.op1.userId },
  });
  expect(denied.status).toBeGreaterThanOrEqual(400);

  const token = await aal2Token(fx, fx.admin);
  const assigned = await api(fx, "/rest/v1/rpc/assign_ticket", {
    method: "POST",
    token,
    body: { p_ticket_id: state.t1, p_operator_id: fx.op1.userId },
  });
  expect(assigned.status).toBe(200);
});

let op1Secret = "";

test("A4-04 · op1 sem MFA: bloqueado (UI e API) e inscreve TOTP até aal2", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, fx.op1.email, fx.op1.password, "/interno");
  await expect(page).toHaveURL(/\/interno\/mfa$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TEXT.mfaTitle);

  await page.goto(`/interno/pedidos/${state.t1}`);
  await expect(page).toHaveURL(/\/interno\/mfa$/);

  // S7 na API: com aal1, a base não entrega nada interno.
  const aal1 = await passwordToken(fx, fx.op1.email, fx.op1.password);
  expect(await api(fx, `/rest/v1/tickets?select=id&id=eq.${state.t1}`, { token: aal1 })).toEqual({
    status: 200,
    body: [],
  });
  const events = await api(fx, "/rest/v1/rpc/staff_ticket_events", {
    method: "POST",
    token: aal1,
    body: { p_ticket_id: state.t1 },
  });
  expect(JSON.stringify(events.body)).toContain("PT404");

  await page.getByRole("button", { name: "Gerar código QR" }).click();
  await expect(page.locator("#mfa-segredo")).toBeVisible();
  op1Secret = (await page.locator("#mfa-segredo").innerText()).trim();
  await page.locator("#mfa-codigo").fill("000000");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.locator("#mfa-mensagem")).toContainText("Código inválido");
  await page.locator("#mfa-codigo").fill(await freshTotp(op1Secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/interno$/);
  await waitStreamed(page);
  await expect(page.getByRole("link", { name: SUBJECT_T1 })).toBeVisible();
  await expect(page.getByText(SUBJECT_T2)).toHaveCount(0);
  await context.close();
});

test("A4-05 · op1 trabalha T1: transições, mensagem, nota e evidência", async ({ browser }) => {
  const page = await staffSignIn(browser, { ...fx.op1, totpSecret: op1Secret });
  await page.goto(`/interno/pedidos/${state.t1}`);
  await waitStreamed(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(SUBJECT_T1);
  await expect(page.locator("dl")).toContainText(client.fullName);

  await transition(page, "em_analise", "Em análise");
  await page.locator("#staff-mensagem-corpo").fill(STAFF_MESSAGE);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator("#staff-mensagem-estado")).toHaveText(TEXT.sent);
  await page.locator("#nota-corpo").fill(NOTE);
  await page.getByRole("button", { name: "Adicionar nota" }).click();
  await expect(page.locator("#nota-estado")).toHaveText(TEXT.noteAdded);
  await expect(page.getByText(NOTE)).toBeVisible();

  await transition(page, "em_preparacao_proposta", "Proposta em preparação");
  await transition(page, "proposta_enviada", "Proposta enviada");

  // Aceite sem evidência: recusado antes da RPC; depois, com evidência.
  await page.locator("#transicao-destino").selectOption("aceite");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.locator("#transicao-evidencia-erro")).toContainText(TEXT.evidenceRequired);
  await expect(page.locator("dl")).toContainText("Proposta enviada");
  await transition(page, "aceite", "Aceite", EVIDENCE);
  await expect(page.locator('section[aria-labelledby="staff-historico"]')).toContainText(
    `Evidência: ${EVIDENCE}`,
  );
  await page.context().close();
});

test("A4-06 · op1 não vê nem escreve em T2 (não atribuído)", async ({ browser }) => {
  const page = await staffSignIn(browser, { ...fx.op1, totpSecret: op1Secret });
  await expectNotFound(page, `/interno/pedidos/${state.t2}`, [SUBJECT_T2]);
  await page.context().close();

  const token = await aal2Token(fx, { ...fx.op1, totpSecret: op1Secret });
  expect(await api(fx, `/rest/v1/tickets?select=id&id=eq.${state.t2}`, { token })).toEqual({
    status: 200,
    body: [],
  });
  const note = await api(fx, "/rest/v1/rpc/add_internal_note", {
    method: "POST",
    token,
    body: { p_ticket_id: state.t2, p_body: "intrusão" },
  });
  expect(JSON.stringify(note.body)).toContain("PT404");
});

test("A4-07 · op2 (outro operador) não vê T1", async ({ browser }) => {
  const page = await staffSignIn(browser, fx.op2);
  await waitStreamed(page);
  await expect(page.getByText(TEXT.empty)).toBeVisible();
  await expectNotFound(page, `/interno/pedidos/${state.t1}`, [SUBJECT_T1, NOTE, EVIDENCE]);
  await page.context().close();
});

test("A4-08 · admin vê todos os pedidos, notas e evidência", async ({ browser }) => {
  const page = await staffSignIn(browser, fx.admin);
  await waitStreamed(page);
  await expect(page.getByRole("link", { name: SUBJECT_T1 })).toBeVisible();
  await expect(page.getByRole("link", { name: SUBJECT_T2 })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: SUBJECT_T2 })).toContainText(TEXT.unassigned);
  await page.goto(`/interno/pedidos/${state.t1}`);
  await waitStreamed(page);
  await expect(page.getByText(NOTE)).toBeVisible();
  await expect(page.getByText(`Evidência: ${EVIDENCE}`)).toBeVisible();
  await page.context().close();
});

test("A4-09 · cliente: vê o progresso, nunca notas, evidência nem dados internos", async () => {
  const page = await clientContext.newPage();
  await page.goto(`/cliente/pedidos/${state.t1}`);
  await waitStreamed(page);
  await expect(page.locator("dl")).toContainText("Aceite");
  const staffMessage = page.locator("li").filter({ hasText: STAFF_MESSAGE });
  await expect(staffMessage).toContainText(TEXT.team);
  await page.close();

  const response = await clientContext.request.get(`/cliente/pedidos/${state.t1}`);
  const html = await response.text();
  for (const hidden of [
    NOTE,
    EVIDENCE,
    "evidence_ref",
    fx.op1.userId,
    fx.op1.email,
    fx.admin.userId,
    "ticket_internal_notes",
  ]) {
    expect(html).not.toContain(hidden);
  }

  const token = await passwordToken(fx, client.email, client.password);
  expect(
    await api(fx, `/rest/v1/ticket_internal_notes?select=id&ticket_id=eq.${state.t1}`, { token }),
  ).toEqual({ status: 200, body: [] });
  const events = await api(fx, "/rest/v1/rpc/staff_ticket_events", {
    method: "POST",
    token,
    body: { p_ticket_id: state.t1 },
  });
  expect(JSON.stringify(events.body)).toContain("PT404");
  const evidence = await api(
    fx,
    `/rest/v1/ticket_events?select=evidence_ref&ticket_id=eq.${state.t1}`,
    {
      token,
    },
  );
  expect(evidence.status).toBeGreaterThanOrEqual(400);
});
