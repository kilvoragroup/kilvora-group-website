/**
 * Fonte única da navegação (cabeçalho, menu móvel, rodapé e sitemap).
 * Máximo de dois níveis. Inspiração estrutural apenas — sem elementos de terceiros.
 */
import { areaHref, areas, areaSlugs } from "@/content/areas";
import { productHref, products, productSlugs } from "@/content/products";
import { resolve, v, type PtLocale, type Text } from "@/content/types";

import { site } from "./site";

export type NavLink = { label: Text; href: string; description?: Text };
export type NavItem = NavLink & { id: string; children?: NavLink[] };

export const mainNav: NavItem[] = [
  {
    id: "areas",
    label: "Áreas",
    href: "/areas",
    description: v("Áreas de actuação", "Áreas de atuação"),
    children: areaSlugs.map((slug) => ({
      label: areas[slug].name,
      href: areaHref(slug),
      description: areas[slug].summary,
    })),
  },
  {
    id: "produtos",
    label: "Produtos",
    href: "/produtos",
    description: "Produtos da KILVORA GROUP",
    children: productSlugs.map((slug) => ({
      label: products[slug].name,
      href: productHref(slug),
      description: products[slug].category,
    })),
  },
  { id: "solucoes", label: "Soluções", href: "/solucoes" },
  { id: "websites", label: "Websites", href: "/websites" },
  { id: "sobre", label: "Sobre", href: "/sobre" },
  { id: "contactos", label: v("Contactos", "Contato"), href: "/contactos" },
];

/**
 * Rotas da área de clientes — RESERVADAS para W3 (portal de clientes).
 * Não existem páginas nem autenticação nesta fase.
 */
export const clientRoutes = {
  signIn: "/cliente/entrar",
  signUp: "/cliente/criar-conta",
  recover: "/cliente/recuperar",
} as const;

export const navActions = {
  /** Indisponível até W3: apresentado sem ligação, com a indicação «Em breve». */
  signIn: { label: "Entrar", href: clientRoutes.signIn, available: false },
  proposal: { label: "Solicitar proposta", href: "/contactos#proposta", available: true },
} as const;

export function getNavigation(locale: PtLocale = site.locale) {
  return { main: resolve(mainNav, locale), actions: navActions };
}

export type ResolvedNavItem = ReturnType<typeof getNavigation>["main"][number];

function normalize(path: string): string {
  const clean = path.split("#")[0]!.split("?")[0]!;
  return clean.length > 1 ? clean.replace(/\/$/, "") : clean;
}

/**
 * Estado activo de uma ligação para o caminho actual:
 * - "page": é a página actual (aria-current="page");
 * - "section": a página actual está dentro desta secção (realce visual);
 * - null: inactiva.
 */
export function activeState(pathname: string, href: string): "page" | "section" | null {
  const current = normalize(pathname);
  const target = normalize(href);
  if (current === target) return "page";
  if (target !== "/" && current.startsWith(`${target}/`)) return "section";
  return null;
}

/** Caminhos públicos do site (sem âncoras nem rotas reservadas), para o sitemap. */
export function publicPaths(): string[] {
  const paths = new Set<string>(["/"]);
  for (const item of mainNav) {
    paths.add(normalize(item.href));
    for (const child of item.children ?? []) paths.add(normalize(child.href));
  }
  return [...paths];
}

/** Secções-âncora das páginas de área (navegação contextual). */
export const areaSections = {
  overview: { id: "visao-geral", label: "Visão geral" },
  services: { id: "servicos", label: "Serviços" },
  related: { id: "relacionados", label: "Relacionados" },
  contact: { id: "contacto", label: v("Contacto", "Contato") },
} satisfies Record<string, { id: string; label: Text }>;

export function getAreaSections(hasRelated: boolean, locale: PtLocale = site.locale) {
  const s = resolve(areaSections, locale);
  return [s.overview, s.services, ...(hasRelated ? [s.related] : []), s.contact];
}
