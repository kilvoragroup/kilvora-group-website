import { describe, expect, it } from "vitest";

import { isLocalizedText } from "./types";
import { isPortalNoticeKey, portalAuth, portalAuthStatus } from "./portal-auth";

function collect(value: unknown, out: { "pt-AO": string; "pt-BR": string }[] = []) {
  if (isLocalizedText(value)) out.push(value);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value)) collect(child, out);
  }
  return out;
}

describe("textos da autenticação do portal", () => {
  const texts = collect(portalAuth);

  it("existem em pt-AO e pt-BR, não vazios", () => {
    expect(texts.length).toBeGreaterThan(30);
    for (const text of texts) {
      expect(text["pt-AO"].trim().length).toBeGreaterThan(0);
      expect(text["pt-BR"].trim().length).toBeGreaterThan(0);
    }
  });

  it("estão marcados como provisórios (P7)", () => {
    expect(portalAuthStatus).toBe("provisorio");
  });

  it("nunca confirmam nem negam a existência de contas", () => {
    for (const text of texts) {
      for (const value of [text["pt-AO"], text["pt-BR"]]) {
        expect(value).not.toMatch(/já existe|não existe|não encontrad|conta inexistente/i);
      }
    }
  });

  it("registo e recuperação usam mensagens condicionais", () => {
    expect(portalAuth.signUp.success["pt-AO"]).toMatch(/Se o endereço puder ser usado/);
    expect(portalAuth.recovery.success["pt-AO"]).toMatch(/^Se existir uma conta/);
    expect(portalAuth.recovery.success["pt-BR"]).toMatch(/^Se existir uma conta/);
  });

  it("avisos só por chave fechada", () => {
    expect(isPortalNoticeKey("link-invalido")).toBe(true);
    expect(isPortalNoticeKey("sessao-terminada")).toBe(true);
    for (const value of ["", "toString", "__proto__", "<script>", undefined, 1]) {
      expect(isPortalNoticeKey(value)).toBe(false);
    }
  });
});
