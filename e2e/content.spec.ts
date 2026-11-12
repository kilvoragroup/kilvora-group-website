import { expect, test } from "@playwright/test";

import { publicPages, viewports } from "./helpers";

test.use({ viewport: viewports.desktop });

test.describe("idioma", () => {
  test("pt-AO é o idioma inicial e o atributo lang corresponde", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-AO");
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(nav.getByRole("link", { name: "Contactos", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Contato", exact: true })).toHaveCount(0);

    await page.goto("/areas/comercio");
    await expect(page.getByText("Comércio electrónico")).toBeVisible();
    await expect(page.getByText("conforme o modelo de negócio adoptado")).toBeVisible();
  });
});

test.describe("planos comerciais (Angola)", () => {
  test("preços, prazos, manutenção e condições correctos", async ({ page }) => {
    await page.goto("/websites");
    const expected = [
      ["Starter", "180.000 Kz", "5–10 dias úteis", "25.000 Kz/mês"],
      ["Business", "350.000 Kz", "10–20 dias úteis", "50.000 Kz/mês"],
      ["Premium", "650.000 Kz", "20–35 dias úteis", "100.000 Kz/mês"],
    ] as const;
    for (const [plan, price, days, maintenance] of expected) {
      const card = page.getByRole("article", { name: plan });
      await expect(card).toContainText(price);
      await expect(card).toContainText(days);
      await expect(card).toContainText(maintenance);
    }
    await expect(page.locator("#condicoes")).toContainText("50% inicial");
    await expect(page.locator("#condicoes")).toContainText("50% final");
    await expect(page.locator("#condicoes")).toContainText("Garantia técnica de 30 dias");
    await expect(page.getByRole("note")).toContainText(
      "Valores de referência para Angola, em kwanzas (Kz), sujeitos a confirmação comercial",
    );
    await expect(page.locator("body")).not.toContainText(/R\$|BRL/);
  });
});

test.describe("segurança e publicação", () => {
  test("todas as páginas têm noindex, nofollow e robots.txt bloqueia tudo", async ({
    page,
    request,
  }) => {
    for (const path of publicPages) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex, nofollow/,
      );
    }
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/\s*$/m);
  });

  test("WhatsApp não é publicado enquanto não aprovado", async ({ page }) => {
    for (const path of ["/", "/contactos", "/websites"]) {
      await page.goto(path);
      await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
      await expect(page.locator('[aria-label^="WhatsApp"]')).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/\+\d{2,3}[\s\d-]{8,}/);
    }
  });

  test("/cliente/* não tem páginas nem autenticação fictícia", async ({ page, request }) => {
    for (const path of ["/cliente/entrar", "/cliente/criar-conta", "/cliente/recuperar"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    await page.goto("/cliente/entrar");
    await expect(page.locator('input[type="password"], form')).toHaveCount(0);

    await page.goto("/");
    await expect(page.locator('a[href^="/cliente"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Entrar" })).toHaveCount(0);
  });

  test("nenhum documento de Docs/ é servido ou referenciado", async ({ page, request }) => {
    for (const path of [
      "/Docs/KILVORA_Proposta_Comercial_Websites.pdf",
      "/docs/KILVORA_Proposta_Comercial_Websites.pdf",
      "/KILVORA_Proposta_Comercial_Websites.pdf",
      "/Logo%203D%20KILVORA.png",
      "/Docs/KILVORA_GROUP_Plano_Director_Website_Institucional_v1.0.md",
    ]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    for (const path of publicPages) {
      await page.goto(path);
      const html = await page.content();
      expect(html, path).not.toMatch(/Docs\/|\.pdf|\.docx|Logo 3D/i);
    }
  });
});
