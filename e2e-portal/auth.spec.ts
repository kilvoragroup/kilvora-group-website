import { type Page, expect, test } from "@playwright/test";

import { newRun, syntheticPassword, type SyntheticUser } from "./support/data";
import { passwordGrant, updatePasswordDirect } from "./support/gotrue";
import { loadLocalSupabase } from "./support/local-supabase";
import { messageIds, waitForVerifyLink } from "./support/mailpit";

/**
 * E2E REAIS da autenticação do portal (A2-B4) contra o Supabase LOCAL e o Mailpit.
 *
 * Executam em série (um trabalhador): os cenários partilham dois utilizadores sintéticos e a
 * caixa do Mailpit. Cada teste usa o seu próprio contexto de navegador (sem `storageState`
 * partilhado), salvo quando o cenário exige o mesmo navegador (PKCE).
 *
 * Só correm com autorização expressa (`E2E_PORTAL_RUN=1`, ver global-setup.ts).
 */

test.describe.configure({ mode: "serial" });

const local = loadLocalSupabase();
const run = newRun();
const userA = run.user("a");
const userB = run.user("b");

const TEXT = {
  signUpOk: "Pedido de registo recebido",
  recoveryOk: "Se existir uma conta com este e-mail",
  badCredentials: "E-mail ou palavra-passe incorrectos.",
  signedInAs: "Sessão iniciada como",
  signedOut: "Sessão terminada.",
  passwordChanged: "Palavra-passe alterada.",
  recoveryRequired: "Para definir uma nova palavra-passe, abra o link de recuperação",
  linkInvalid: "O link é inválido ou expirou.",
};

async function signUp(page: Page, user: SyntheticUser) {
  await page.goto("/cliente/criar-conta");
  await page.locator("#registo-nome").fill(user.fullName);
  await page.locator("#registo-empresa").fill(user.company);
  await page.locator("#registo-email").fill(user.email);
  await page.locator("#registo-palavra-passe").fill(user.password);
  await page.locator("#registo-confirmacao").fill(user.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("status")).toContainText(TEXT.signUpOk);
}

async function signIn(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/cliente/entrar?next=${encodeURIComponent(next)}` : "/cliente/entrar");
  await page.locator("#entrar-email").fill(email);
  await page.locator("#entrar-palavra-passe").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function expectSignedInAs(page: Page, user: SyntheticUser) {
  await expect(page).toHaveURL(/\/cliente$/);
  await expect(page.getByText(TEXT.signedInAs)).toContainText(user.fullName);
}

test("01 · registo e confirmação de e-mail (utilizador A)", async ({ page }) => {
  const seen = await messageIds(local.mailpitUrl, userA.email);
  await signUp(page, userA);
  const { link } = await waitForVerifyLink(local.mailpitUrl, userA.email, seen);
  // Mesmo navegador: o verificador PKCE foi gravado pela acção de registo.
  await page.goto(link);
  await expectSignedInAs(page, userA);
});

test("02 · registo e confirmação de e-mail (utilizador B)", async ({ page }) => {
  const seen = await messageIds(local.mailpitUrl, userB.email);
  await signUp(page, userB);
  const { link } = await waitForVerifyLink(local.mailpitUrl, userB.email, seen);
  await page.goto(link);
  await expectSignedInAs(page, userB);
});

test("03 · registo repetido não revela a conta existente", async ({ page }) => {
  await signUp(page, { ...userA, password: syntheticPassword() });
  // Mesma mensagem condicional do registo novo (verificada em signUp).
});

test("04 · entrada e saída (só por POST)", async ({ page }) => {
  await signIn(page, userA.email, userA.password);
  await expectSignedInAs(page, userA);

  await page.getByRole("button", { name: "Terminar sessão" }).click();
  await expect(page).toHaveURL(/\/cliente\/entrar\?aviso=sessao-terminada$/);
  await expect(page.getByRole("status")).toContainText(TEXT.signedOut);

  await page.goto("/cliente");
  await expect(page).toHaveURL(/\/cliente\/entrar/);
});

test("05 · credenciais erradas: mesma mensagem para conta inexistente", async ({ page }) => {
  // Mensagem do próprio formulário (não `role="alert"`: o anunciador de rotas do Next.js também
  // o usa). `toHaveText` aguarda a resposta da Server Action antes de comparar.
  const message = page.locator("#entrar-mensagem");

  await signIn(page, userA.email, `${userA.password}x`);
  await expect(message).toHaveText(TEXT.badCredentials);
  const wrongPassword = await message.textContent();

  await signIn(page, `inexistente-${run.runId}@e2e.example.test`, userA.password);
  await expect(message).toHaveText(TEXT.badCredentials);
  const unknownAccount = await message.textContent();

  expect(unknownAccount).toBe(wrongPassword);
});

test("06 · isolamento entre dois utilizadores (S3)", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await signIn(pageA, userA.email, userA.password);
    await signIn(pageB, userB.email, userB.password);
    await expectSignedInAs(pageA, userA);
    await expectSignedInAs(pageB, userB);
    await expect(pageA.getByText(userB.fullName)).toHaveCount(0);
    await expect(pageB.getByText(userA.fullName)).toHaveCount(0);

    // Mesmo navegador, utilizadores em sequência: nada do anterior fica visível.
    await pageA.getByRole("button", { name: "Terminar sessão" }).click();
    await signIn(pageA, userB.email, userB.password);
    await expectSignedInAs(pageA, userB);
    await expect(pageA.getByText(userA.fullName)).toHaveCount(0);

    // Nunca em caches partilhadas.
    const response = await pageA.request.get("/cliente");
    expect(response.headers()["cache-control"]).toContain("no-store");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("07 · redireccionamentos maliciosos recusados", async ({ page, baseURL }) => {
  for (const next of ["https://evil.example/cliente", "//evil.example", "/\\evil.example"]) {
    await signIn(page, userA.email, userA.password, next);
    await expect(page).toHaveURL(`${baseURL}/cliente`);
    await page.getByRole("button", { name: "Terminar sessão" }).click();
  }
  const callback = await page.request.get(
    "/cliente/auth/confirmar?next=https%3A%2F%2Fevil.example",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(303);
  expect(new URL(callback.headers().location).origin).toBe(baseURL);
});

test("08 · sessão normal não define nova palavra-passe pela aplicação", async ({ page }) => {
  await signIn(page, userA.email, userA.password);
  await expectSignedInAs(page, userA);
  await page.goto("/cliente/nova-palavra-passe");
  await expect(page.getByText(TEXT.recoveryRequired)).toBeVisible();
  await expect(page.locator("#nova-palavra-passe")).toHaveCount(0);
});

test("09 · API directa do GoTrue: sessão normal sem palavra-passe actual é recusada", async () => {
  const token = await passwordGrant(local, userB.email, userB.password);
  expect(token, "sessão normal de B").not.toBeNull();
  const attempt = await updatePasswordDirect(local, token!, syntheticPassword());
  // Evidência no registo da execução: só o estado HTTP e o código de erro (sem tokens nem
  // dados pessoais). O relatório `list` captura esta saída independentemente das pastas.
  console.log(`[E2E portal] 09 gotrue status=${attempt.status} code=${attempt.code ?? "—"}`);
  test.info().annotations.push({ type: "gotrue-error-code", description: attempt.code ?? "—" });
  // Recusa por política: 4xx, nunca limite (429) nem erro do servidor (5xx).
  expect(attempt.status, `código: ${attempt.code ?? "—"}`).toBeGreaterThanOrEqual(400);
  expect(attempt.status, `código: ${attempt.code ?? "—"}`).toBeLessThan(500);
  expect(attempt.status, "recusa por limite não prova a política").not.toBe(429);
  // A palavra-passe de B mantém-se.
  expect(await passwordGrant(local, userB.email, userB.password)).not.toBeNull();
});

test("10 · recuperação PKCE e nova palavra-passe (utilizador A)", async ({ page }) => {
  const seen = await messageIds(local.mailpitUrl, userA.email);
  await page.goto("/cliente/recuperar");
  await page.locator("#recuperar-email").fill(userA.email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toContainText(TEXT.recoveryOk);

  const { link } = await waitForVerifyLink(local.mailpitUrl, userA.email, seen);
  await page.goto(link);
  await expect(page).toHaveURL(/\/cliente\/nova-palavra-passe$/);

  const oldPassword = userA.password;
  const newPassword = syntheticPassword();
  await page.locator("#nova-palavra-passe").fill(newPassword);
  await page.locator("#nova-confirmacao").fill(newPassword);
  await page.getByRole("button", { name: "Guardar palavra-passe" }).click();
  await expect(page).toHaveURL(/\/cliente\/entrar\?aviso=palavra-passe-alterada$/);
  userA.password = newPassword;

  expect(await passwordGrant(local, userA.email, oldPassword)).toBeNull();
  expect(await passwordGrant(local, userA.email, newPassword)).not.toBeNull();

  // O link de recuperação não pode ser reutilizado.
  await page.goto(link);
  await expect(page.locator("#nova-palavra-passe")).toHaveCount(0);

  test.info().annotations.push({ type: "recovery-link", description: "usado uma vez" });
});

test("11 · pesquisa de recuperação neutra para conta inexistente", async ({ page }) => {
  await page.goto("/cliente/recuperar");
  await page.locator("#recuperar-email").fill(`inexistente-${run.runId}@e2e.example.test`);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toContainText(TEXT.recoveryOk);
});

test("12 · cookies de sessão em localhost e portal activo só neste ambiente", async ({
  page,
  context,
}) => {
  await signIn(page, userB.email, userB.password);
  await expectSignedInAs(page, userB);
  const authCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(authCookies.length).toBeGreaterThan(0);
  for (const cookie of authCookies) {
    expect(cookie.secure, cookie.name).toBe(false); // HTTP de loopback (regra A1-B2-R1)
    expect(cookie.sameSite, cookie.name).toBe("Lax");
    expect(cookie.path, cookie.name).toBe("/");
  }

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Entrar" }).first()).toHaveAttribute(
    "href",
    "/cliente/entrar",
  );
  await page.goto("/cliente/entrar");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
