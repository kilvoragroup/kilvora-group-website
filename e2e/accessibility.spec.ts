import { expect, test } from "@playwright/test";

import { activeElement, viewports } from "./helpers";

test.describe("acessibilidade (teclado e foco)", () => {
  test.use({ viewport: viewports.desktop });

  test("skip link é o primeiro elemento, fica visível e leva ao conteúdo", async ({ page }) => {
    await page.goto("/websites");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    expect((await skip.boundingBox())!.width).toBeGreaterThan(20);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#conteudo$/);
    expect((await activeElement(page)).id).toBe("conteudo");

    // O Tab seguinte continua dentro do conteúdo principal, não no cabeçalho.
    await page.keyboard.press("Tab");
    const inMain = await page.evaluate(
      () => !!document.getElementById("conteudo")?.contains(document.activeElement),
    );
    expect(inMain).toBe(true);
  });

  test("ordem de tabulação lógica no cabeçalho", async ({ page }) => {
    await page.goto("/");
    const order: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      order.push((await activeElement(page)).text);
    }
    expect(order).toEqual([
      "Saltar para o conteúdo",
      "KILVORA GROUP — início",
      "Áreas",
      "Produtos",
      "Soluções",
      "Websites",
      "Sobre",
      "Contactos",
      "Solicitar proposta",
      "Solicitar proposta", // primeiro CTA do hero
    ]);
  });

  test("foco visível com contorno de 2px (fundo claro e superfície navy)", async ({ page }) => {
    await page.goto("/");
    const outline = () =>
      page.evaluate(() => {
        const s = getComputedStyle(document.activeElement!);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor };
      });

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab"); // botão «Áreas» (fundo claro)
    const light = await outline();
    expect(light.style).not.toBe("none");
    expect(light.width).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < 7; i++) await page.keyboard.press("Tab"); // CTA do hero (navy)
    const inverse = await outline();
    expect(inverse.style).not.toBe("none");
    expect(inverse.width).toBeGreaterThanOrEqual(2);
    expect(inverse.color).not.toBe(light.color); // anel laranja em superfície navy
  });

  test("cartões clicáveis mostram foco no cartão inteiro", async ({ page }) => {
    await page.goto("/areas");
    const link = page.locator("#areas").getByRole("link", { name: "Tecnologia" });
    await link.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    const cardOutline = await link.evaluate(
      (el) => getComputedStyle(el.closest("article")!).outlineStyle,
    );
    expect(cardOutline).not.toBe("none");
  });
});

test.describe("movimento reduzido", () => {
  test.use({ viewport: viewports.desktop });

  test("sem preferência: scroll suave", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe("smooth");
  });

  test("com movimento reduzido: sem scroll suave nem transições", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe("auto");
    const duration = await page
      .getByRole("button", { name: "Áreas" })
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(duration).toBeLessThan(0.01);
  });
});
