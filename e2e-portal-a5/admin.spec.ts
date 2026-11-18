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
} from "../e2e-portal-a4/support";

/**
 * E2E REAIS da administração (A5) numa instância Supabase LOCAL ISOLADA própria.
 * Actores: admin (D13), op1 e op2 (operadores), cliente. Pedidos: T1 (atribuição e
 * reatribuição) e T2 (cancelado pelo cliente e reaberto pelo admin). Só a chave publishable.
 */

test.describe.configure({ mode: "serial" });

const fx = loadFixtures();
const run = newRun();
const client = run.user("a5c");
const SUBJECT_T1 = `Website A5 ${run.runId}`;
const SUBJECT_T2 = `Consultoria A5 ${run.runId}`;
const PROVISION_EMAIL = `e2e-${run.runId}-novo@e2e.example.test`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const TEXT = {
  notFound: "Página não encontrada",
  assigned: "Atribuição actualizada.",
  provisioned: "Provisionamento registado. Guarde o número:",
  already: "Já existe um provisionamento pendente",
  cancelled: "Provisionamento cancelado.",
  neutral: "Não encontrámos o que procura.",
  reasonRequired: "Indique o motivo.",
};

const state = { t1: "", t2: "", provisioningId: "", adminToken: "", op1Secret: "" };
let clientContext: BrowserContext;
let adminPage: Page;

test.afterAll(async () => {
  await clientContext?.close();
  await adminPage?.context().close();
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

async function staffSignIn(browser: Browser, staff: StaffFixture): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, staff.email, staff.password, "/interno");
  await expect(page).toHaveURL(/\/interno\/mfa$/);
  await page.locator("#mfa-codigo").fill(await freshTotp(staff.totpSecret ?? ""));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/interno$/);
  return page;
}

async function expectNotFound(page: Page, path: string) {
  await page.goto(path);
  await waitStreamed(page);
  await expect(page.locator("main")).toContainText(TEXT.notFound);
}

async function rpc(token: string, fn: string, body: unknown) {
  return api(fx, `/rest/v1/rpc/${fn}`, { method: "POST", token, body });
}

/** Inscrição TOTP do op1 pela API pública (sessão do próprio, chave publishable). */
async function enrollTotp(staff: StaffFixture): Promise<string> {
  const token = await passwordToken(fx, staff.email, staff.password);
  const factor = await api(fx, "/auth/v1/factors", {
    method: "POST",
    token,
    body: { factor_type: "totp", friendly_name: "Consola KILVORA" },
  });
  const { id, totp } = factor.body as { id: string; totp: { secret: string } };
  const challenge = await api(fx, `/auth/v1/factors/${id}/challenge`, {
    method: "POST",
    token,
    body: {},
  });
  const verified = await api(fx, `/auth/v1/factors/${id}/verify`, {
    method: "POST",
    token,
    body: {
      challenge_id: (challenge.body as { id: string }).id,
      code: await freshTotp(totp.secret),
    },
  });
  expect(verified.status).toBe(200);
  return totp.secret;
}

async function createTicket(page: Page, type: string, subject: string) {
  await page.goto("/cliente/pedidos/novo");
  await page.locator("#pedido-tipo").selectOption(type);
  await page.locator("#pedido-assunto").fill(subject);
  await page.locator("#pedido-descricao").fill("Descrição sintética do pedido para os E2E da A5.");
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page).toHaveURL(/\/cliente\/pedidos\/[0-9a-f-]{36}\?aviso=criado$/);
  return UUID.exec(page.url())?.[0] ?? "";
}

const row = (page: Page, userId: string) => page.getByTestId(`perfil-${userId}`);

test("A5-01 · cliente cria T1 e T2; sem acesso à administração", async ({ browser }) => {
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
  state.t1 = await createTicket(page, "desenvolvimento_websites", SUBJECT_T1);
  state.t2 = await createTicket(page, "consultoria", SUBJECT_T2);
  await expectNotFound(page, "/interno/admin");
  await expectNotFound(page, "/interno/admin/auditoria");
  await page.close();
});

test("A5-02 · operador sem acesso à administração (UI e RPC)", async ({ browser }) => {
  const page = await staffSignIn(browser, fx.op2);
  await waitStreamed(page);
  await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
  await expectNotFound(page, "/interno/admin");
  await expectNotFound(page, "/interno/admin/auditoria");
  await page.context().close();

  const token = await aal2Token(fx, fx.op2);
  for (const [fn, body] of [
    ["assign_ticket", { p_ticket_id: state.t1, p_operator_id: fx.op2.userId }],
    ["admin_audit_log", {}],
    ["grant_role", { p_user_id: fx.op1.userId, p_role: "admin" }],
    ["admin_provision_staff", { p_email: PROVISION_EMAIL }],
  ] as const) {
    const result = await rpc(token, fn, body);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(result.body)).toContain("PT404");
  }
});

test("A5-03 · admin atribui T1 ao op1 e reatribui ao op2", async ({ browser }) => {
  state.op1Secret = await enrollTotp(fx.op1);
  adminPage = await staffSignIn(browser, fx.admin);
  await waitStreamed(adminPage);
  await expect(adminPage.getByRole("link", { name: "Administração" })).toBeVisible();

  await adminPage.goto(`/interno/pedidos/${state.t1}`);
  await waitStreamed(adminPage);
  await adminPage.locator("#atribuicao-operador").selectOption(fx.op1.userId);
  await adminPage.getByRole("button", { name: "Guardar atribuição" }).click();
  await expect(adminPage.locator("#atribuicao-estado")).toHaveText(TEXT.assigned);

  state.adminToken = await aal2Token(fx, fx.admin);
  const op1 = await aal2Token(fx, { ...fx.op1, totpSecret: state.op1Secret });
  expect(await api(fx, `/rest/v1/tickets?select=id&id=eq.${state.t1}`, { token: op1 })).toEqual({
    status: 200,
    body: [{ id: state.t1 }],
  });

  await adminPage.reload();
  await waitStreamed(adminPage);
  await adminPage.locator("#atribuicao-operador").selectOption(fx.op2.userId);
  await adminPage.getByRole("button", { name: "Guardar atribuição" }).click();
  await expect(adminPage.locator("#atribuicao-estado")).toHaveText(TEXT.assigned);
  await expect(adminPage.locator('section[aria-labelledby="staff-historico"]')).toContainText(
    "Pedido reencaminhado",
  );

  // O op1 perde o acesso; o op2 ganha-o.
  expect(await api(fx, `/rest/v1/tickets?select=id&id=eq.${state.t1}`, { token: op1 })).toEqual({
    status: 200,
    body: [],
  });
  const op2 = await aal2Token(fx, fx.op2);
  expect(await api(fx, `/rest/v1/tickets?select=id&id=eq.${state.t1}`, { token: op2 })).toEqual({
    status: 200,
    body: [{ id: state.t1 }],
  });
});

test("A5-04 · revogar o papel do op2 retira-lhe os pedidos; voltar a dar o papel", async () => {
  await adminPage.goto("/interno/admin");
  await waitStreamed(adminPage);
  await row(adminPage, fx.op2.userId).getByRole("button", { name: "Retirar Operador" }).click();
  await expect(row(adminPage, fx.op2.userId)).toContainText("sem papel");

  const ticket = await api(fx, `/rest/v1/tickets?select=assigned_operator_id&id=eq.${state.t1}`, {
    token: state.adminToken,
  });
  expect(ticket.body).toEqual([{ assigned_operator_id: null }]);

  const form = adminPage.getByTestId(`dar-${fx.op2.userId}`);
  await form.locator("select").selectOption("operador");
  await form.getByRole("button", { name: "Dar papel" }).click();
  await expect(row(adminPage, fx.op2.userId)).toContainText("Operador");
});

test("A5-05 · suspender o op1 bloqueia a consola; reactivar repõe", async ({ browser }) => {
  await row(adminPage, fx.op1.userId).getByRole("button", { name: "Suspender" }).click();
  await expect(row(adminPage, fx.op1.userId)).toContainText("Suspenso");

  const page = await (await browser.newContext()).newPage();
  await signIn(page, fx.op1.email, fx.op1.password, "/interno");
  await waitStreamed(page);
  await expect(page.locator("main")).toContainText(TEXT.notFound);
  await page.context().close();

  await row(adminPage, fx.op1.userId).getByRole("button", { name: "Reactivar" }).click();
  await expect(row(adminPage, fx.op1.userId)).toContainText("Activo");
});

test("A5-06 · auto-protecção do admin (UI e RPC)", async () => {
  const self = row(adminPage, fx.admin.userId);
  await expect(self).toContainText("(você)");
  await expect(self.getByRole("button")).toHaveCount(0);
  for (const [fn, body, reason] of [
    ["revoke_role", { p_user_id: fx.admin.userId, p_role: "admin" }, "self_revoke_forbidden"],
    [
      "admin_set_profile_status",
      { p_user_id: fx.admin.userId, p_status: "suspenso" },
      "self_status_change_forbidden",
    ],
  ] as const) {
    const result = await rpc(state.adminToken, fn, body);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(result.body)).toContain(reason);
  }
});

test("A5-07 · provisionamento: registar, duplicado recusado, cancelar", async () => {
  await adminPage.locator("#provisionar-email").fill(PROVISION_EMAIL);
  await adminPage.getByRole("button", { name: "Provisionar" }).click();
  const message = adminPage.locator("#provisionar-estado");
  await expect(message).toContainText(TEXT.provisioned);
  state.provisioningId = /(\d+)\s*$/.exec(await message.innerText())?.[1] ?? "";
  expect(state.provisioningId).toMatch(/^\d+$/);

  await adminPage.locator("#provisionar-email").fill(PROVISION_EMAIL.toUpperCase());
  await adminPage.getByRole("button", { name: "Provisionar" }).click();
  await expect(message).toContainText(TEXT.already);

  const cancel = adminPage.locator("#cancelar-prov-estado");
  await adminPage.locator("#cancelar-prov-id").fill(state.provisioningId);
  await adminPage.getByRole("button", { name: "Cancelar provisionamento" }).click();
  await expect(cancel).toHaveText(TEXT.cancelled);
  await adminPage.locator("#cancelar-prov-id").fill(state.provisioningId);
  await adminPage.getByRole("button", { name: "Cancelar provisionamento" }).click();
  await expect(cancel).toHaveText(TEXT.neutral);
});

test("A5-08 · cliente cancela T2; admin reabre com motivo obrigatório", async () => {
  const page = await clientContext.newPage();
  await page.goto(`/cliente/pedidos/${state.t2}`);
  await waitStreamed(page);
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(page.locator("dl")).toContainText("Cancelado");

  await adminPage.goto(`/interno/pedidos/${state.t2}`);
  await waitStreamed(adminPage);
  await adminPage.getByRole("button", { name: "Reabrir" }).click();
  await expect(adminPage.locator("#reabrir-motivo-erro")).toHaveText(TEXT.reasonRequired);
  await adminPage.locator("#reabrir-motivo").fill(`Reavaliação ${run.runId}`);
  await adminPage.getByRole("button", { name: "Reabrir" }).click();
  await expect(adminPage.locator("dl")).toContainText("Em análise");

  await page.reload();
  await waitStreamed(page);
  await expect(page.locator("dl")).toContainText("Em análise");
  const history = page.locator('section[aria-labelledby="pedido-historico-titulo"]');
  await expect(history).toContainText("Pedido reaberto");
  await expect(history).toContainText(`Reavaliação ${run.runId}`);
  await page.close();
});

test("A5-09 · auditoria regista tudo e filtra; cliente sem eventos internos", async () => {
  await adminPage.goto("/interno/admin/auditoria");
  await waitStreamed(adminPage);
  const main = adminPage.locator("main");
  for (const action of [
    "ticket_assigned",
    "role_revoked",
    "role_granted",
    "profile_status_changed",
    "staff_provisioned",
    "staff_provisioning_cancelled",
    "ticket_reopened",
  ]) {
    await expect(main).toContainText(action);
  }
  await adminPage.goto("/interno/admin/auditoria?tipo=user_role");
  await waitStreamed(adminPage);
  await expect(main).toContainText("role_granted");
  await expect(main).not.toContainText("ticket_assigned");

  const html = await (await clientContext.request.get(`/cliente/pedidos/${state.t1}`)).text();
  for (const hidden of [
    "Pedido encaminhado",
    "Pedido reencaminhado",
    fx.op1.userId,
    fx.op2.userId,
    fx.admin.userId,
  ]) {
    expect(html).not.toContain(hidden);
  }
});
