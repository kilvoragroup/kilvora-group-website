import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { areas, areaSlugs } from "@/content/areas";

import {
  activeState,
  clientRoutes,
  getAreaSections,
  getNavigation,
  mainNav,
  navActions,
  publicPaths,
} from "./navigation";

const appDir = fileURLToPath(new URL("../app", import.meta.url));
const pageExists = (path: string) => existsSync(`${appDir}${path === "/" ? "" : path}/page.tsx`);

describe("navegação principal", () => {
  it("tem os itens globais aprovados, pela ordem definida", () => {
    expect(getNavigation("pt-AO").main.map((item) => item.label)).toEqual([
      "Áreas",
      "Produtos",
      "Soluções",
      "Websites",
      "Sobre",
      "Contactos",
    ]);
    expect(navActions.signIn.label).toBe("Entrar");
    expect(navActions.proposal.label).toBe("Solicitar proposta");
  });

  it("o painel Áreas tem as seis áreas, pela ordem aprovada", () => {
    const panel = getNavigation("pt-AO").main.find((item) => item.id === "areas");
    expect(panel?.children?.map((child) => child.label)).toEqual([
      "Tecnologia",
      "Inovação",
      "Consultoria",
      "Gestão",
      "Formação",
      "Comércio",
    ]);
  });

  it("o painel Produtos tem apenas Kilvora Core e Kilvora HCM", () => {
    const panel = getNavigation("pt-AO").main.find((item) => item.id === "produtos");
    expect(panel?.children?.map((child) => child.label)).toEqual(["Kilvora Core", "Kilvora HCM"]);
  });

  it("não ultrapassa dois níveis", () => {
    for (const item of mainNav) {
      for (const child of item.children ?? []) {
        expect(child).not.toHaveProperty("children");
      }
    }
  });

  it("cada ligação aponta para uma página existente", () => {
    for (const path of publicPaths()) expect(pageExists(path), path).toBe(true);
    expect(pageExists(navActions.proposal.href.split("#")[0]!)).toBe(true);
  });

  it("a área de clientes está reservada (W3): sem páginas e sem ligação activa", () => {
    expect(navActions.signIn.available).toBe(false);
    for (const route of Object.values(clientRoutes)) {
      expect(pageExists(route), route).toBe(false);
      expect(publicPaths()).not.toContain(route);
    }
  });

  it("adapta rótulos à variante do português", () => {
    const label = (locale: "pt-AO" | "pt-BR") =>
      getNavigation(locale).main.find((item) => item.id === "contactos")?.label;
    expect(label("pt-AO")).toBe("Contactos");
    expect(label("pt-BR")).toBe("Contato");
  });
});

describe("activeState", () => {
  it("identifica a página actual e a secção-mãe", () => {
    expect(activeState("/areas/gestao", "/areas/gestao")).toBe("page");
    expect(activeState("/areas/gestao/", "/areas/gestao")).toBe("page");
    expect(activeState("/areas/gestao", "/areas")).toBe("section");
    expect(activeState("/areas", "/areas/gestao")).toBeNull();
    expect(activeState("/sobre", "/")).toBeNull();
    expect(activeState("/", "/")).toBe("page");
    expect(activeState("/contactos", "/contactos#proposta")).toBe("page");
  });
});

describe("navegação contextual das áreas", () => {
  it("só inclui «Relacionados» quando a área tem ligações relacionadas", () => {
    for (const slug of areaSlugs) {
      const ids = getAreaSections(Boolean(areas[slug].related?.length), "pt-AO").map((s) => s.id);
      expect(ids[0]).toBe("visao-geral");
      expect(ids).toContain("servicos");
      expect(ids.at(-1)).toBe("contacto");
      expect(ids.includes("relacionados")).toBe(Boolean(areas[slug].related?.length));
    }
  });
});
