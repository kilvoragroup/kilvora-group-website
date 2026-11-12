import { expect, test } from "@playwright/test";

import { activeElement, areaSlugs, publicPages, viewports } from "./helpers";

const mainNav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Navegação principal" });

test.describe("navegação desktop", () => {
  test.use({ viewport: viewports.desktop });

  test("página inicial carrega com título e navegação principal", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Juntos por um futuro maior");
    const nav = mainNav(page);
    await expect(nav).toBeVisible();
    for (const name of ["Áreas", "Produtos"]) {
      await expect(nav.getByRole("button", { name })).toBeVisible();
    }
    for (const name of ["Soluções", "Websites", "Sobre", "Contactos"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
  });

  test("painel Áreas abre e fecha por clique, com aria-expanded e aria-controls", async ({
    page,
  }) => {
    await page.goto("/");
    const button = mainNav(page).getByRole("button", { name: "Áreas" });
    const panelId = await button.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = page.locator(`[id="${panelId}"]`);

    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link")).toHaveText([
      "Visão geral",
      /Tecnologia/,
      /Inovação/,
      /Consultoria/,
      /Gestão/,
      /Formação/,
      /Comércio/,
    ]);

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
  });

  test("Escape fecha o painel e devolve o foco ao botão", async ({ page }) => {
    await page.goto("/");
    const button = mainNav(page).getByRole("button", { name: "Produtos" });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  });

  test("clique fora fecha o painel", async ({ page }) => {
    await page.goto("/");
    const button = mainNav(page).getByRole("button", { name: "Áreas" });
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    // Clique numa zona fora do cabeçalho e do painel (o painel cobre o topo do hero).
    await page.mouse.click(700, 880);
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("teclado: Enter abre, Tab percorre o painel e sair do menu fecha-o", async ({ page }) => {
    await page.goto("/");
    const button = mainNav(page).getByRole("button", { name: "Produtos" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Tab");
    expect((await activeElement(page)).text).toBe("Visão geral");
    await page.keyboard.press("Tab");
    expect((await activeElement(page)).href).toBe("/produtos/kilvora-core");
    await page.keyboard.press("Tab");
    expect((await activeElement(page)).href).toBe("/produtos/kilvora-hcm");

    // O próximo Tab sai do painel para «Soluções»: o painel fecha.
    await page.keyboard.press("Tab");
    expect((await activeElement(page)).href).toBe("/solucoes");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("navegar a partir do painel fecha-o e marca aria-current", async ({ page }) => {
    await page.goto("/");
    const button = mainNav(page).getByRole("button", { name: "Áreas" });
    await button.click();
    await page
      .getByRole("link", { name: /^Gestão/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/areas\/gestao$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gestão");
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await expect(
      page.locator(`[id="${await button.getAttribute("aria-controls")}"] a[href="/areas/gestao"]`),
    ).toHaveAttribute("aria-current", "page");
  });

  test("ligações directas marcam aria-current=page", async ({ page }) => {
    await page.goto("/websites");
    await expect(mainNav(page).getByRole("link", { name: "Websites" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(mainNav(page).getByRole("link", { name: "Sobre" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  for (const slug of areaSlugs) {
    test(`navegação contextual em /areas/${slug}`, async ({ page }) => {
      await page.goto(`/areas/${slug}`);
      const context = page.getByRole("navigation", { name: "Nesta página" });
      await expect(context).toBeVisible();

      const hrefs = await context
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      expect(hrefs[0]).toBe("#visao-geral");
      expect(hrefs).toContain("#servicos");
      expect(hrefs.at(-1)).toBe("#contacto");
      for (const href of hrefs) await expect(page.locator(href!)).toHaveCount(1);

      await context.getByRole("link", { name: "Serviços" }).click();
      await expect(page).toHaveURL(new RegExp(`/areas/${slug}#servicos$`));
      await expect(context.getByRole("link", { name: "Serviços" })).toHaveAttribute(
        "aria-current",
        "true",
      );

      // O título da secção não fica escondido sob o cabeçalho e a navegação contextual.
      const heading = page.locator("#servicos h2");
      await expect(heading).toBeInViewport();
      const navBottom = (await context.boundingBox())!.y + (await context.boundingBox())!.height;
      expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(navBottom - 1);
    });
  }

  test("todas as ligações internas respondem sem 404", async ({ page, request }) => {
    const links = new Set<string>();
    for (const path of publicPages) {
      await page.goto(path);
      const hrefs = await page
        .locator("a[href^='/']")
        .evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
      hrefs.forEach((href) => links.add(href.split("#")[0]!));
    }
    expect(links.size).toBeGreaterThan(10);
    for (const link of links) {
      const response = await request.get(link);
      expect(response.status(), link).toBe(200);
    }
  });
});

test.describe("navegação móvel", () => {
  test.use({ viewport: viewports.mobile, hasTouch: true });

  const toggle = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: /Abrir menu|Fechar menu/ });

  test("menu desktop oculto; menu móvel abre, expande secções e navega", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Áreas" }).first()).toBeHidden();

    const button = toggle(page);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toHaveAccessibleName("Abrir menu");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).toHaveAccessibleName("Fechar menu");

    const panel = page.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    const areas = panel.getByRole("button", { name: "Áreas" });
    await expect(areas).toHaveAttribute("aria-expanded", "false");
    await areas.click();
    await expect(areas).toHaveAttribute("aria-expanded", "true");
    const sub = page.locator(`[id="${await areas.getAttribute("aria-controls")}"]`);
    await expect(sub.getByRole("link")).toHaveCount(7);

    await sub.getByRole("link", { name: "Formação" }).click();
    await expect(page).toHaveURL(/\/areas\/formacao$/);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });

  test("Escape fecha o menu móvel e devolve o foco ao botão", async ({ page }) => {
    await page.goto("/");
    await toggle(page).click();
    await page.keyboard.press("Escape");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(toggle(page)).toBeFocused();
  });

  test("o foco não sai do menu móvel aberto", async ({ page }) => {
    await page.goto("/");
    const button = toggle(page);
    await button.click();
    const panelId = (await button.getAttribute("aria-controls"))!;

    const inside = () =>
      page.evaluate((id) => {
        const el = document.activeElement;
        const panel = document.getElementById(id);
        const toggleBtn = document.querySelector(`[aria-controls="${id}"]`);
        return el === toggleBtn || !!panel?.contains(el);
      }, panelId);

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      expect(await inside(), `Tab #${i + 1}`).toBe(true);
    }
    await button.focus();
    await page.keyboard.press("Shift+Tab");
    expect(await inside()).toBe(true);
    expect((await activeElement(page)).text).toBe("Solicitar proposta");
  });
});
