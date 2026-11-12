import { describe, expect, it } from "vitest";

import { getContent, rawContent } from "./index";
import { products } from "./products";
import { isLocalizedText, resolve } from "./types";
import { formatDeliveryDays, formatKz, plans } from "./websites";

/** Recolhe todos os textos visíveis (ignora identificadores, ligações e fontes). */
function texts(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => texts(item, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (["href", "slug", "id", "source", "status"].includes(key)) continue;
      texts(item, out);
    }
  }
  return out;
}

// Grafias pré-Acordo (usadas em Angola) que não devem aparecer em pt-BR, e vice-versa.
const preAcordo =
  /\b(actua\w*|objectiv\w*|projecto\w*|acção|acções|activ\w*|direcção|selecç\w*|electr\w*|óptim\w*|optimiz\w*|contacto\w*|registo|equipas?|telemóvel|facto|actual\w*|redacç\w*|correcç\w*|arquitect\w*|adoptad\w*|protecç\w*|económic\w*|sector\w*|multissector\w*|planeament\w*|monitorização|autónom\w*)\b/i;
const posAcordoBR =
  /\b(atua\w*|objetiv\w*|projeto\w*|ação|ações|ativ\w*|direção|seleç\w*|eletr\w*|otimiz\w*|contato\w*|equipe\w*|celular|atual\w*|redação|correç\w*|arquitet\w*|adotad\w*|proteç\w*|econômic\w*|setor\w*|multissetor\w*|planejament\w*|monitoramento|autônom\w*)\b/i;

describe("variantes do português", () => {
  it("resolve textos localizados e mantém textos comuns", () => {
    const sample = { a: { "pt-AO": "contacto", "pt-BR": "contato" }, b: "comum", c: [1] };
    expect(isLocalizedText(sample.a)).toBe(true);
    expect(resolve(sample, "pt-AO")).toEqual({ a: "contacto", b: "comum", c: [1] });
    expect(resolve(sample, "pt-BR")).toEqual({ a: "contato", b: "comum", c: [1] });
  });

  it("pt-BR não contém grafias pré-Acordo", () => {
    const offending = texts(getContent("pt-BR")).filter((t) => preAcordo.test(t));
    expect(offending).toEqual([]);
  });

  it("pt-AO não contém grafias exclusivas do Brasil", () => {
    const offending = texts(getContent("pt-AO")).filter((t) => posAcordoBR.test(t));
    expect(offending).toEqual([]);
  });

  it("as duas variantes têm a mesma estrutura", () => {
    const shape = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(shape)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
          : typeof v;
    expect(shape(getContent("pt-AO"))).toEqual(shape(getContent("pt-BR")));
  });
});

describe("regras de conteúdo", () => {
  it("todo o conteúdo tem estado aprovado ou provisório", () => {
    const statuses = JSON.stringify(rawContent).match(/"status":"[^"]+"/g) ?? [];
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(s).toMatch(/"status":"(aprovado|provisorio)"/);
  });

  it("os produtos não publicam contagem de módulos nem disponibilidade comercial", () => {
    const text = texts(products).join(" ");
    expect(text).not.toMatch(/\b(18|20)\s+módulos\b/i);
    expect(text).not.toMatch(/disponível|já disponível|em produção/i);
    expect(text).toMatch(/em validação/);
  });

  it("não publica clientes, certificações, depoimentos nem estatísticas", () => {
    const text = texts(rawContent).join(" ");
    expect(text).not.toMatch(
      /certificad[oa]s? (ISO|pela)|depoimento|clientes satisfeitos|\d+\s*%\s+de/i,
    );
    expect(text).not.toMatch(/marca registada|®/i);
  });
});

describe("planos de websites (Angola)", () => {
  it("mantém os valores aprovados", () => {
    expect(
      plans.map((p) => [
        p.name,
        p.priceKz,
        p.deliveryDays.min,
        p.deliveryDays.max,
        p.maintenance.monthlyKz,
      ]),
    ).toEqual([
      ["Starter", 180_000, 5, 10, 25_000],
      ["Business", 350_000, 10, 20, 50_000],
      ["Premium", 650_000, 20, 35, 100_000],
    ]);
  });

  it("formata kwanzas e prazos como na proposta comercial", () => {
    expect(formatKz(180_000)).toBe("180.000 Kz");
    expect(formatKz(1_250_000)).toBe("1.250.000 Kz");
    expect(formatKz(0)).toBe("0 Kz");
    expect(() => formatKz(-1)).toThrow();
    expect(formatDeliveryDays({ min: 5, max: 10 })).toBe("5–10 dias úteis");
  });

  it("assinala os preços como sujeitos a confirmação e restritos a Angola", () => {
    const { websites } = getContent("pt-AO");
    expect(websites.pricingDisclaimer).toMatch(/Angola/);
    expect(websites.pricingDisclaimer).toMatch(/sujeitos a confirmação comercial/);
    expect(websites.meta.market).toBe("Angola");
    expect(JSON.stringify(rawContent)).not.toMatch(/R\$|BRL|reais/);
  });
});
