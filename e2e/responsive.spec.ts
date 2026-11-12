import { expect, test } from "@playwright/test";

import { publicPages, viewports } from "./helpers";

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`responsividade ${viewport.width}px (${name})`, () => {
    test.use({ viewport });

    test("nenhuma página tem overflow horizontal", async ({ page }) => {
      for (const path of publicPages) {
        await page.goto(path);
        const { scroll, client } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(scroll, `${path}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
      }
    });

    test("cartões de preço e tabelas são legíveis", async ({ page }) => {
      await page.goto("/websites");
      for (const plan of ["Starter", "Business", "Premium"]) {
        const card = page.getByRole("article", { name: plan });
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeVisible();
        const box = (await card.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(Math.min(300, viewport.width - 40));
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }

      // Tabelas largas ficam num contentor com scroll próprio, sem alargar a página.
      for (const table of await page.locator("table").all()) {
        await table.scrollIntoViewIfNeeded();
        const wrapper = table.locator("xpath=..");
        const wrapperBox = (await wrapper.boundingBox())!;
        expect(wrapperBox.x + wrapperBox.width).toBeLessThanOrEqual(viewport.width);
        const fontSize = await table.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(14);
      }
    });
  });
}

test.describe("utilização móvel", () => {
  test.use({ viewport: viewports.mobile, hasTouch: true });

  test("alvos de toque do menu móvel têm pelo menos 44px", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Abrir menu" });
    const box = (await toggle.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    const panel = page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
    await toggle.tap();
    await expect(panel).toBeVisible();
    for (const item of await panel.locator("a, button").all()) {
      if (!(await item.isVisible())) continue;
      expect((await item.boundingBox())!.height, await item.innerText()).toBeGreaterThanOrEqual(44);
    }
  });
});
