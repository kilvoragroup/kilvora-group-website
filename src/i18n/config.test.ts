import { describe, expect, it } from "vitest";

import { defaultLocale, getEnabledLocales, isEnabledLocale } from "./config";

describe("i18n config", () => {
  it("o idioma por omissão está activo", () => {
    expect(isEnabledLocale(defaultLocale)).toBe(true);
  });

  it("só expõe idiomas com tradução validada", () => {
    expect(getEnabledLocales()).toEqual(["pt-BR", "pt-AO"]);
    expect(isEnabledLocale("en")).toBe(false);
    expect(isEnabledLocale("es")).toBe(false);
  });

  it("rejeita códigos desconhecidos", () => {
    expect(isEnabledLocale("fr")).toBe(false);
  });
});
