/**
 * Títulos, introduções e metadados por página.
 * Textos curtos de enquadramento, sem afirmações factuais novas.
 */
import { v, type Text } from "./types";

type PageCopy = { title: Text; description: Text; intro?: Text; servicesTitle?: Text };

export const pages = {
  home: {
    title: "KILVORA GROUP",
    description: "Tecnologia, inovação e soluções digitais orientadas para o negócio.",
  },
  about: {
    title: "Sobre a KILVORA GROUP",
    description: "Missão, visão, valores e posicionamento da KILVORA GROUP.",
  },
  areas: {
    title: v("Áreas de actuação", "Áreas de atuação"),
    description: "Tecnologia, Inovação, Consultoria, Gestão, Formação e Comércio.",
    intro: "Diferentes áreas de negócio sob uma identidade corporativa comum.",
  },
  products: {
    title: "Produtos",
    description: "Kilvora Core e Kilvora HCM.",
  },
  solutions: {
    title: "Soluções e serviços",
    description: v(
      "Soluções e serviços da KILVORA GROUP, organizados por área de actuação.",
      "Soluções e serviços da KILVORA GROUP, organizados por área de atuação.",
    ),
    intro: v(
      "Soluções e serviços organizados pelas áreas de actuação da KILVORA GROUP.",
      "Soluções e serviços organizados pelas áreas de atuação da KILVORA GROUP.",
    ),
    servicesTitle: v("Serviços por área de actuação", "Serviços por área de atuação"),
  },
  websites: {
    title: "Desenvolvimento de websites",
    description: "Planos Starter, Business e Premium para Angola.",
  },
  contacts: {
    title: v("Contactos", "Contato"),
    description: v(
      "Contactos institucionais da KILVORA GROUP.",
      "Contatos institucionais da KILVORA GROUP.",
    ),
    intro: v(
      "Para pedidos de proposta e informações, contacte a KILVORA GROUP por email.",
      "Para pedidos de proposta e informações, entre em contato com a KILVORA GROUP por email.",
    ),
  },
} satisfies Record<string, PageCopy>;

/** Indicações para um pedido de proposta por email (campos do Plano Director §7). */
export const proposalRequest = {
  title: "Solicitar proposta",
  intro: v(
    "Envie o seu pedido por email, indicando, sempre que possível:",
    "Envie seu pedido por email, indicando, sempre que possível:",
  ),
  fields: [
    "Nome e empresa",
    v("País e sector de actividade", "País e setor de atividade"),
    v("Telefone ou WhatsApp para contacto", "Telefone ou WhatsApp para contato"),
    "Serviço, área ou produto de interesse",
    "Finalidade e mensagem",
  ] as Text[],
  emailSubject: "Pedido de proposta — KILVORA GROUP",
};
