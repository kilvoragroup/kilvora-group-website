/**
 * Áreas de actuação (seis, conforme Plano Director §4).
 *
 * Fontes: resumos — Proposta comercial p. 2 (Tecnologia, Inovação, Consultoria, Gestão)
 * e Dossiê §7 (Formação, Comércio); descrições e serviços — Dossiê §7 e Plano §4.
 * As listas de serviços representam o «âmbito pretendido» (Dossiê §7) e estão em validação.
 */
import { v, type ContentStatus, type Text } from "./types";

export const areaSlugs = [
  "tecnologia",
  "inovacao",
  "consultoria",
  "gestao",
  "formacao",
  "comercio",
] as const;

export type AreaSlug = (typeof areaSlugs)[number];

export type Area = {
  slug: AreaSlug;
  name: Text;
  summary: Text;
  overview: { status: ContentStatus; source: string; paragraphs: Text[] };
  services: { status: ContentStatus; source: string; items: Text[]; note?: Text };
  related?: { label: Text; href: string; description: Text }[];
};

const projectos = v("Gestão de projectos", "Gestão de projetos");

export const areas: Record<AreaSlug, Area> = {
  tecnologia: {
    slug: "tecnologia",
    name: "Tecnologia",
    summary: v("Soluções digitais modernas e fiáveis.", "Soluções digitais modernas e confiáveis."),
    overview: {
      status: "aprovado",
      source: "Dossiê §7.1",
      paragraphs: [
        "Área dedicada ao desenvolvimento e à prestação de serviços tecnológicos, de acordo com a capacidade operacional.",
      ],
    },
    services: {
      status: "provisorio",
      source: "Dossiê §7.1",
      items: [
        "Desenvolvimento e implementação de software",
        "Sistemas e aplicações empresariais",
        "Transformação digital",
        "Consultoria em tecnologia da informação",
        "Suporte técnico e administração de sistemas",
        "Automação de processos",
        "Análise de dados e inteligência empresarial",
        "Integração de soluções digitais",
        "Consultoria em segurança da informação, dentro das competências e autorizações aplicáveis",
      ],
    },
    related: [
      {
        label: "Desenvolvimento de websites",
        href: "/websites",
        description: "Planos Starter, Business e Premium.",
      },
      {
        label: "Kilvora Core",
        href: "/produtos/kilvora-core",
        description: "ERP em modelo SaaS.",
      },
      {
        label: "Kilvora HCM",
        href: "/produtos/kilvora-hcm",
        description: "Gestão de recursos humanos.",
      },
    ],
  },
  inovacao: {
    slug: "inovacao",
    name: "Inovação",
    summary: v(
      "Experiências actuais para cada organização.",
      "Experiências atuais para cada organização.",
    ),
    overview: {
      status: "aprovado",
      source: "Dossiê §5.4 (valor «Inovação e transformação»)",
      paragraphs: [
        "Valorizamos a criatividade, a tecnologia, o conhecimento e a capacidade de transformar desafios em soluções úteis e sustentáveis.",
      ],
    },
    services: {
      status: "provisorio",
      source: "Plano Director §4 (submenus candidatos)",
      items: [
        "Transformação digital",
        "Automação",
        "Inteligência artificial",
        "Soluções inovadoras",
      ],
    },
  },
  consultoria: {
    slug: "consultoria",
    name: "Consultoria",
    summary: "Orientação adaptada às necessidades do cliente.",
    overview: {
      status: "aprovado",
      source: "Dossiê §7.2",
      paragraphs: ["Área dedicada à consultoria e ao apoio ao desenvolvimento organizacional."],
    },
    services: {
      status: "provisorio",
      source: "Dossiê §7.2",
      items: [
        "Consultoria empresarial e operacional",
        "Mapeamento e melhoria de processos",
        v("Planeamento estratégico", "Planejamento estratégico"),
        projectos,
        "Gestão da mudança",
        "Eficiência operacional",
        "Apoio à transformação digital",
        "Consultoria em organização e desenvolvimento de negócios",
      ],
      note: "Os serviços sujeitos a habilitação profissional específica serão prestados apenas nos termos legalmente permitidos.",
    },
  },
  gestao: {
    slug: "gestao",
    name: "Gestão",
    summary: "Foco em oportunidades de negócio.",
    overview: {
      status: "provisorio",
      source: "Dossiê §7.3 e §7.6 (agrupamento por validar)",
      paragraphs: [
        v(
          "Prestação de serviços empresariais e administrativos, e planeamento, coordenação e acompanhamento de iniciativas empresariais.",
          "Prestação de serviços empresariais e administrativos, e planejamento, coordenação e acompanhamento de iniciativas empresariais.",
        ),
      ],
    },
    services: {
      status: "provisorio",
      source: "Dossiê §7.3 e §7.6",
      items: [
        "Apoio administrativo",
        "Organização documental e operacional",
        "Apoio à gestão de fornecedores",
        "Gestão de processos de negócio",
        "Apoio à implementação de procedimentos internos",
        "Serviços de suporte operacional",
        "Preparação de relatórios e indicadores de gestão",
        projectos,
        v("Planeamento e controlo de actividades", "Planejamento e controle de atividades"),
        v("Coordenação de equipas e fornecedores", "Coordenação de equipes e fornecedores"),
        "Acompanhamento de prazos e entregáveis",
        v("Gestão de riscos de projecto", "Gestão de riscos de projeto"),
        "Apoio à implementação de iniciativas de transformação",
      ],
    },
  },
  formacao: {
    slug: "formacao",
    name: "Formação",
    summary: "Formação e desenvolvimento de competências.",
    overview: {
      status: "aprovado",
      source: "Dossiê §7.5",
      paragraphs: ["Área destinada à formação e ao desenvolvimento de competências."],
    },
    services: {
      status: "provisorio",
      source: "Dossiê §7.5",
      items: [
        "Formação profissional",
        "Cursos e workshops",
        "Capacitação tecnológica",
        "Formação em gestão e negócios",
        "Desenvolvimento de competências digitais",
        "Consultoria e apoio à aprendizagem empresarial",
        "Produção de conteúdos educativos",
      ],
      note: "A emissão de qualificações ou certificados com reconhecimento oficial dependerá dos requisitos legais aplicáveis.",
    },
  },
  comercio: {
    slug: "comercio",
    name: "Comércio",
    summary: "Comércio e intermediação comercial.",
    overview: {
      status: "aprovado",
      source: "Dossiê §7.4",
      paragraphs: [
        v(
          "Área destinada ao comércio e à intermediação comercial, conforme o modelo de negócio adoptado.",
          "Área destinada ao comércio e à intermediação comercial, conforme o modelo de negócio adotado.",
        ),
      ],
    },
    services: {
      status: "provisorio",
      source: "Dossiê §7.4",
      items: [
        "Compra e venda de produtos",
        v("Comércio electrónico", "Comércio eletrônico"),
        "Distribuição e fornecimento",
        "Representação comercial, quando legalmente permitida",
        "Intermediação entre fornecedores e clientes",
        "Comercialização de equipamentos e soluções tecnológicas",
        "Desenvolvimento de canais de venda e parcerias comerciais",
      ],
    },
  },
};

/** Nota geral do Dossiê §7 sobre o âmbito dos serviços. */
export const servicesScopeNote: Text =
  "O âmbito de serviços apresentado está em validação. A sua disponibilidade depende da capacidade operacional e dos requisitos legais aplicáveis em cada mercado.";

export function areaHref(slug: AreaSlug): string {
  return `/areas/${slug}`;
}
