/** Textos de interface partilhados (navegação, acções, estados). */
import { v, type Text } from "./types";

export const common = {
  skipToContent: v("Saltar para o conteúdo", "Pular para o conteúdo"),
  mainNavigation: "Navegação principal",
  pageNavigation: "Nesta página",
  openMenu: "Abrir menu",
  closeMenu: "Fechar menu",
  menu: "Menu",
  overview: "Visão geral",
  soon: "Em breve",
  clientAreaSoon: v(
    "Área de clientes disponível numa próxima fase",
    "Área de clientes disponível em uma próxima fase",
  ),
  inValidation: "Em validação",
  inValidationHint: "Conteúdo em validação, sujeito a alteração antes da publicação definitiva.",
  cta: {
    requestProposal: "Solicitar proposta",
    exploreAreas: "Conhecer as áreas",
    viewPlans: "Ver planos",
    learnMore: "Saber mais",
    requestInfo: "Solicitar informações",
    contactUs: v("Fale connosco", "Fale conosco"),
    sendEmail: "Enviar email",
  },
  footer: {
    company: "Empresa",
    contact: v("Contacto", "Contato"),
    rights: "KILVORA GROUP",
    provisionalBrand: "Identidade visual provisória, sujeita a aprovação.",
  },
  notFound: {
    title: "Página não encontrada",
    text: v(
      "A página que procura não existe ou ainda não está disponível.",
      "A página que você procura não existe ou ainda não está disponível.",
    ),
    back: "Voltar ao início",
  },
} satisfies Record<string, Text | Record<string, Text>>;
