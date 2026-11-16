import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";

import { newRun, type SyntheticUser } from "../e2e-portal/support/data";
import { passwordGrant } from "../e2e-portal/support/gotrue";
import { loadLocalSupabase } from "../e2e-portal/support/local-supabase";
import { messageIds, waitForVerifyLink } from "../e2e-portal/support/mailpit";

/**
 * E2E REAIS da área do cliente (A3, portões S3/S4/S5) contra o Supabase LOCAL.
 *
 * Dois utilizadores sintéticos em contas distintas (A: AO, B: BR). Cobrem criação e consulta de
 * pedidos, isolamento por URL, por Server Action adulterada e pela API directa, 404 neutro,
 * mensagens, cancelamento, ausência de campos internos e protecção de sessão.
 *
 * RESÍDUO ACEITE (decisão A3-FINAL): pedidos, eventos e mensagens são imutáveis e ficam na base
 * LOCAL; o `cleanup.sql` recusa estes utilizadores. Nunca correr contra o Supabase alojado
 * (`loadLocalSupabase` exige loopback). Só com `E2E_PORTAL_RUN=1`, pela configuração própria
 * `playwright.portal-a3.config.ts` (a infraestrutura E2E da A2 não é usada nem alterada).
 */

test.describe.configure({ mode: "serial" });

const local = loadLocalSupabase();
const run = newRun();
const userA = run.user("a3a");
const userB = run.user("a3b");

const TEXT = {
  signedInAs: "Sessão iniciada como",
  created: "Pedido registado.",
  sent: "Mensagem enviada.",
  cancelled: "Pedido cancelado.",
  notFoundTitle: "Página não encontrada",
  notFoundAction: "Não encontrámos o que procura.",
  profileSaved: "Perfil actualizado.",
  accountSaved: "Conta actualizada.",
};

const SUBJECT_A = `Website institucional ${run.runId}`;
const SUBJECT_B = `Consultoria BR ${run.runId}`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
/** Nomes de colunas internas que nunca podem chegar ao cliente (HTML nem payload RSC). */
const INTERNAL_KEYS = [
  "evidence_ref",
  "assigned_operator_id",
  "requester_id",
  "author_id",
  "actor_id",
  "account_id",
  "ticket_internal_notes",
];

const HISTORY = 'section[aria-labelledby="pedido-historico-titulo"]';

const state = { ticketA: "", ticketB: "", referenceA: "" };

async function signUpAndConfirm(browser: Browser, user: SyntheticUser): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const seen = await messageIds(local.mailpitUrl, user.email);
  await page.goto("/cliente/criar-conta");
  await page.locator("#registo-nome").fill(user.fullName);
  await page.locator("#registo-empresa").fill(user.company);
  await page.locator("#registo-email").fill(user.email);
  await page.locator("#registo-palavra-passe").fill(user.password);
  await page.locator("#registo-confirmacao").fill(user.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.locator("#registo-mensagem")).toContainText("Pedido de registo recebido");
  const { link } = await waitForVerifyLink(local.mailpitUrl, user.email, seen);
  await page.goto(link); // mesmo navegador (PKCE)
  await expect(page).toHaveURL(/\/cliente$/);
  await page.close();
  return context;
}

async function signIn(page: Page, user: SyntheticUser) {
  await page.goto("/cliente/entrar");
  await page.locator("#entrar-email").fill(user.email);
  await page.locator("#entrar-palavra-passe").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cliente$/);
  await expect(page.getByText(TEXT.signedInAs)).toContainText(user.fullName);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Terminar sessão" }).click();
  await expect(page).toHaveURL(/\/cliente\/entrar/);
}

async function setLocaleAndCountry(page: Page, locale: string, country: string) {
  await page.goto("/cliente/conta");
  await page.locator("#perfil-idioma").selectOption(locale);
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.locator("#perfil-estado")).toHaveText(TEXT.profileSaved);
  await page.locator("#conta-pais").fill(country);
  await page.getByRole("button", { name: "Guardar conta" }).click();
  await expect(page.locator("#conta-estado")).toHaveText(TEXT.accountSaved);
  await page.reload();
  await expect(page.locator("#perfil-idioma")).toHaveValue(locale);
  await expect(page.locator("#conta-pais")).toHaveValue(country);
}

async function createTicket(
  page: Page,
  input: { type: string; plan?: string; subject: string; details: string },
): Promise<string> {
  await page.goto("/cliente/pedidos/novo");
  await page.locator("#pedido-tipo").selectOption(input.type);
  if (input.plan) await page.locator(`input[name="planId"][value="${input.plan}"]`).check();
  await page.locator("#pedido-assunto").fill(input.subject);
  await page.locator("#pedido-descricao").fill(input.details);
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page).toHaveURL(/\/cliente\/pedidos\/[0-9a-f-]{36}\?aviso=criado$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(input.subject);
  const id = UUID.exec(page.url())?.[0];
  expect(id).toBeTruthy();
  return id as string;
}

/**
 * Abre um pedido e devolve o estado HTTP, o texto principal e o `noindex`.
 * Com Cache Components, um `notFound()` em tempo de pedido corre depois de o shell ser enviado:
 * o estado HTTP fica 200 e o Next.js apresenta a página «não encontrado» com `noindex`
 * (docs: loading.md, «Status codes»). O que se exige é a MESMA resposta neutra nos três casos.
 */
async function openTicket(page: Page, id: string) {
  const response = await page.goto(`/cliente/pedidos/${id}`);
  // O conteúdo chega por streaming: esperar que o fallback do <Suspense> desapareça.
  await expect(page.getByText("A carregar…")).toHaveCount(0);
  return {
    status: response?.status() ?? 0,
    body: await page.locator("main").innerText(),
    noindex: await page.locator('meta[name="robots"][content*="noindex"]').count(),
  };
}

/** API REST directa com a sessão de um utilizador (como faria um cliente malicioso). */
async function rest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${local.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: local.publishableKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

let contextA: BrowserContext;
let contextB: BrowserContext;

test.afterAll(async () => {
  await contextA?.close();
  await contextB?.close();
});

test("A3-01 · dois clientes em contas distintas (A: AO, B: BR)", async ({ browser }) => {
  contextA = await signUpAndConfirm(browser, userA);
  contextB = await signUpAndConfirm(browser, userB);
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await setLocaleAndCountry(pageA, "pt-AO", "AO");
  await setLocaleAndCountry(pageB, "pt-BR", "BR");
  await pageA.close();
  await pageB.close();
});

test("A3-02 · criar e consultar pedido com plano de website (A)", async () => {
  const page = await contextA.newPage();
  state.ticketA = await createTicket(page, {
    type: "desenvolvimento_websites",
    plan: "business",
    subject: SUBJECT_A,
    details: "Website institucional com 6 páginas e formulário de contacto.",
  });
  await expect(page.getByRole("status").filter({ hasText: TEXT.created })).toBeVisible();
  const description = page.locator("#pedido-descricao-titulo + p");
  await expect(description).toContainText("Plano pretendido: Business");
  await expect(description).toContainText("350.000 Kz");
  await expect(description).toContainText("50.000 Kz/mês");
  await expect(description).toContainText("sujeitos a confirmação comercial");
  state.referenceA = (await page.locator("dd.font-mono").innerText()).trim();
  expect(state.referenceA).toMatch(/^KG-\d{4}-\d{6}$/);
  await expect(page.locator(HISTORY)).toContainText("Pedido registado");

  await page.locator("#mensagem-corpo").fill("Podemos agendar uma reunião?");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator("#mensagem-estado")).toHaveText(TEXT.sent);
  await expect(page.getByText("Podemos agendar uma reunião?")).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "Podemos agendar" })).toContainText("Você");

  await page.goto("/cliente");
  await expect(page.getByRole("link", { name: SUBJECT_A })).toBeVisible();
  await page.close();
});

test("A3-03 · B cria o seu pedido e só vê os seus", async () => {
  const page = await contextB.newPage();
  state.ticketB = await createTicket(page, {
    type: "consultoria",
    subject: SUBJECT_B,
    details: "Pedido de consultoria para a empresa no Brasil.",
  });
  await page.goto("/cliente");
  await expect(page.getByRole("link", { name: SUBJECT_B })).toBeVisible();
  await expect(page.getByText(SUBJECT_A)).toHaveCount(0);
  await expect(page.getByText(state.referenceA)).toHaveCount(0);
  await page.close();
});

test("A3-04 · acesso cruzado por URL: 404 neutro igual a inexistente e inválido", async () => {
  const page = await contextB.newPage();
  const foreign = await openTicket(page, state.ticketA);
  const unknown = await openTicket(page, UNKNOWN_ID);
  const invalid = await openTicket(page, "nao-e-um-uuid");

  console.log(`[A3-04] estado HTTP do «não encontrado» em streaming: ${foreign.status}`);
  for (const result of [foreign, unknown, invalid]) {
    expect(result.status).toBe(foreign.status);
    expect(result.noindex).toBeGreaterThan(0);
    expect(result.body).toContain(TEXT.notFoundTitle);
    expect(result.body).not.toContain(SUBJECT_A);
    expect(result.body).not.toContain(state.referenceA);
    expect(result.body).not.toContain("Podemos agendar");
  }
  expect(foreign.body).toBe(unknown.body);
  expect(foreign.body).toBe(invalid.body);
  await page.close();
});

test("A3-05 · Server Actions adulteradas por B sobre o pedido de A são recusadas", async () => {
  const page = await contextB.newPage();
  await page.goto(`/cliente/pedidos/${state.ticketB}`);

  await page
    .locator('form:has(#mensagem-corpo) input[name="ticketId"]')
    .evaluate((el, id) => ((el as HTMLInputElement).value = id), state.ticketA);
  await page.locator("#mensagem-corpo").fill("Mensagem intrusa");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator("#mensagem-estado")).toHaveText(TEXT.notFoundAction);

  await page
    .locator('form:has(#cancelar-motivo) input[name="ticketId"]')
    .evaluate((el, id) => ((el as HTMLInputElement).value = id), state.ticketA);
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(page.locator("#cancelar-estado")).toHaveText(TEXT.notFoundAction);
  await page.close();

  // O pedido de A ficou intacto: sem a mensagem intrusa e não cancelado.
  const pageA = await contextA.newPage();
  await pageA.goto(`/cliente/pedidos/${state.ticketA}`);
  await expect(pageA.getByText("Mensagem intrusa")).toHaveCount(0);
  await expect(pageA.locator("dl")).toContainText("Recebido");
  await pageA.close();
});

test("A3-06 · API directa: isolamento e campos internos recusados", async () => {
  const tokenA = await passwordGrant(local, userA.email, userA.password);
  const tokenB = await passwordGrant(local, userB.email, userB.password);
  expect(tokenA && tokenB).toBeTruthy();
  const a = tokenA as string;
  const b = tokenB as string;
  const id = state.ticketA;

  // B não obtém nada do pedido de A (pedido, mensagens, histórico).
  for (const path of [
    `tickets?select=id,subject&id=eq.${id}`,
    `ticket_messages?select=id,body&ticket_id=eq.${id}`,
    `ticket_events?select=id,event_type&ticket_id=eq.${id}`,
  ]) {
    expect(await rest(b, path)).toEqual({ status: 200, body: [] });
  }
  // B não escreve no pedido de A pela RPC.
  const rpc = await rest(b, "rpc/add_ticket_message", {
    method: "POST",
    body: JSON.stringify({ p_ticket_id: id, p_body: "intrusão" }),
  });
  expect(rpc.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(rpc.body)).toContain("PT404");

  // Mesmo o dono não obtém evidence_ref nem notas internas.
  const evidence = await rest(a, `ticket_events?select=evidence_ref&ticket_id=eq.${id}`);
  expect(evidence.status).toBeGreaterThanOrEqual(400);
  expect(await rest(a, `ticket_internal_notes?select=id&ticket_id=eq.${id}`)).toEqual({
    status: 200,
    body: [],
  });
  // O dono vê o seu pedido.
  const own = await rest(a, `tickets?select=id&id=eq.${id}`);
  expect(own).toEqual({ status: 200, body: [{ id }] });
});

test("A3-07 · HTML e payload RSC sem campos internos nem dados de outra conta", async () => {
  for (const path of [`/cliente/pedidos/${state.ticketA}`, "/cliente", "/cliente/conta"]) {
    const response = await contextA.request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const html = await response.text();
    for (const key of INTERNAL_KEYS) expect(html).not.toContain(key);
    expect(html).not.toContain(SUBJECT_B);
    expect(html).not.toContain(userB.email);
  }
});

test("A3-08 · cancelamento autorizado pelo próprio cliente", async () => {
  const page = await contextA.newPage();
  await page.goto(`/cliente/pedidos/${state.ticketA}`);
  await page.locator("#cancelar-motivo").fill("Projecto adiado.");
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(page.locator("dl")).toContainText("Cancelado");
  await expect(page.getByText("Este pedido está encerrado.")).toBeVisible();
  await expect(page.locator("#mensagem-corpo")).toHaveCount(0);
  await expect(page.locator("#cancelar-motivo")).toHaveCount(0);
  await expect(page.locator(HISTORY)).toContainText("Estado alterado: Recebido → Cancelado");
  await expect(page.locator(HISTORY)).toContainText("Projecto adiado.");
  await page.close();
});

test("A3-09 · protecção de sessão e troca de utilizador no mesmo navegador (S3)", async ({
  browser,
}) => {
  const anonymous = await browser.newContext();
  const anon = await anonymous.newPage();
  await anon.goto(`/cliente/pedidos/${state.ticketA}`);
  await expect(anon).toHaveURL(/\/cliente\/entrar\?next=%2Fcliente%2Fpedidos%2F/);
  await anon.goto("/cliente/conta");
  await expect(anon).toHaveURL(/\/cliente\/entrar/);
  await anonymous.close();

  const shared = await browser.newContext();
  const page = await shared.newPage();
  await signIn(page, userA);
  await expect(page.getByRole("link", { name: SUBJECT_A })).toBeVisible();
  await signOut(page);
  await page.goto(`/cliente/pedidos/${state.ticketA}`);
  await expect(page).toHaveURL(/\/cliente\/entrar/);

  await signIn(page, userB);
  await expect(page.getByRole("link", { name: SUBJECT_B })).toBeVisible();
  await expect(page.getByText(SUBJECT_A)).toHaveCount(0);
  const foreign = await openTicket(page, state.ticketA);
  expect(foreign.body).toContain(TEXT.notFoundTitle);
  expect(foreign.body).not.toContain(SUBJECT_A);
  await shared.close();
});
