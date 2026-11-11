/**
 * Planos de desenvolvimento de websites — exclusivamente Angola, em kwanzas.
 * Fonte: Proposta comercial «Desenvolvimento de websites e soluções digitais» v1.0/2026.
 * Valores de referência sujeitos a confirmação comercial; não constituem cotação.
 * Não existem preços aprovados para o Brasil ou outros mercados.
 */
import { v, type ContentStatus, type Text } from "./types";

export type PlanId = "starter" | "business" | "premium";

export type Plan = {
  id: PlanId;
  name: string;
  subtitle: Text;
  audience: Text;
  /** Preço de desenvolvimento, em Kz. */
  priceKz: number;
  pages: Text;
  deliveryDays: { min: number; max: number };
  maintenance: { monthlyKz: number; supportHours: number; description: Text };
  includes: Text[];
  excludes: Text[];
};

export const websitesMeta = {
  status: "aprovado" as ContentStatus,
  source: "Proposta comercial de websites v1.0/2026 (pp. 3–15)",
  market: "Angola",
  currency: "Kz",
};

export const websitesIntro: Text =
  "Websites profissionais para fortalecer a presença digital, melhorar a comunicação com os clientes e potenciar oportunidades de negócio.";

export const websitesBenefits: { title: Text; text: Text }[] = [
  {
    title: "Adaptado a cada empresa",
    text: "Soluções ajustadas à dimensão, identidade e necessidades de cada organização.",
  },
  {
    title: "Moderno e responsivo",
    text: v(
      "Experiência pensada para computador, tablet e telemóvel.",
      "Experiência pensada para computador, tablet e celular.",
    ),
  },
  {
    title: "Orientado para resultados",
    text: v(
      "Comunicação mais próxima dos clientes e captação de contactos.",
      "Comunicação mais próxima dos clientes e captação de contatos.",
    ),
  },
];

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    subtitle: "Website essencial",
    audience: "Profissionais independentes, pequenas empresas e empreendedores.",
    priceKz: 180_000,
    pages: "Até 3 páginas",
    deliveryDays: { min: 5, max: 10 },
    maintenance: {
      monthlyKz: 25_000,
      supportHours: 1,
      description: v(
        "Monitorização básica, verificações de disponibilidade, actualizações aplicáveis e pequenas correcções.",
        "Monitoramento básico, verificações de disponibilidade, atualizações aplicáveis e pequenas correções.",
      ),
    },
    includes: [
      v(
        "Website até 3 páginas (início, sobre e serviços/contactos)",
        "Website até 3 páginas (início, sobre e serviços/contatos)",
      ),
      v(
        "Design moderno e responsivo: computador, tablet e telemóvel",
        "Design moderno e responsivo: computador, tablet e celular",
      ),
      "WhatsApp, formulário simples e redes sociais",
      "Google Maps, quando aplicável; SEO básico",
      "Publicação, testes funcionais e entrega",
    ],
    excludes: [
      v(
        "Loja online, pagamentos electrónicos ou área reservada",
        "Loja online, pagamentos eletrônicos ou área reservada",
      ),
      "Autenticação, painel administrativo personalizado ou integrações complexas",
      v(
        "Fotografias/vídeos profissionais e redacção integral de conteúdos",
        "Fotografias/vídeos profissionais e redação integral de conteúdos",
      ),
      "Funcionalidades adicionais não previstas",
    ],
  },
  {
    id: "business",
    name: "Business",
    subtitle: "Website empresarial",
    audience: "PME, instituições e prestadores de serviços.",
    priceKz: 350_000,
    pages: "Até 6 páginas",
    deliveryDays: { min: 10, max: 20 },
    maintenance: {
      monthlyKz: 50_000,
      supportHours: 3,
      description: v(
        "Monitorização regular, actualizações, verificação de segurança e pequenas alterações de conteúdo/correcções.",
        "Monitoramento regular, atualizações, verificação de segurança e pequenas alterações de conteúdo/correções.",
      ),
    },
    includes: [
      "Website até 6 páginas e design personalizado conforme a identidade visual",
      v(
        "Páginas institucionais, serviços, equipa/organização e contactos",
        "Páginas institucionais, serviços, equipe/organização e contatos",
      ),
      "Formulário avançado, WhatsApp, Google Maps e redes sociais",
      v(
        "SEO inicial, optimização para móveis e segurança básica",
        "SEO inicial, otimização para dispositivos móveis e segurança básica",
      ),
      "Google Analytics, quando aplicável; testes, publicação e entrega",
    ],
    excludes: [
      "E-commerce, CRM/ERP ou área privada de clientes",
      "Reservas complexas, APIs externas ou integrações avançadas",
      "Produção profissional de conteúdos e funcionalidades fora do âmbito",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    subtitle: "Website empresarial premium",
    audience: "Empresas e organizações que procuram presença digital diferenciada.",
    priceKz: 650_000,
    pages: "Até 10 páginas",
    deliveryDays: { min: 20, max: 35 },
    maintenance: {
      monthlyKz: 100_000,
      supportHours: 6,
      description: v(
        "Monitorização reforçada, actualizações, segurança, gestão de conteúdos e pequenas melhorias.",
        "Monitoramento reforçado, atualizações, segurança, gestão de conteúdos e pequenas melhorias.",
      ),
    },
    includes: [
      "Website até 10 páginas e design premium personalizado",
      v(
        "Arquitectura de conteúdos: institucionais, serviços, equipa e notícias/artigos",
        "Arquitetura de conteúdos: institucionais, serviços, equipe e notícias/artigos",
      ),
      "Formulários avançados, WhatsApp, redes sociais e SEO técnico inicial",
      v(
        "Optimização de desempenho, segurança básica e Google Analytics",
        "Otimização de desempenho, segurança básica e Google Analytics",
      ),
      "Painel de gestão de conteúdos, quando previsto na solução acordada",
      v(
        "Animações seleccionadas, testes, publicação, entrega e formação básica no painel (quando aplicável)",
        "Animações selecionadas, testes, publicação, entrega e treinamento básico no painel (quando aplicável)",
      ),
    ],
    excludes: [
      "Loja online completa, aplicações móveis ou plataformas SaaS",
      "ERP, CRM, RH ou integrações bancárias complexas",
      "Produção audiovisual, licenças premium ou conteúdos extensos",
      "Funcionalidades não previstas no âmbito aprovado",
    ],
  },
];

export const maintenanceNotes: Text[] = [
  "Opcional e contratada separadamente.",
  "Horas não utilizadas não transitam para o mês seguinte.",
  "Novas funcionalidades são orçamentadas à parte.",
  "Serviços de terceiros e licenças não estão incluídos.",
  "A manutenção não substitui o desenvolvimento de novos módulos.",
];

/** Custos adicionais estimados (Proposta p. 11). Número = Kz; texto = sob consulta/orçamento. */
export const additionalCosts: {
  label: Text;
  values: Record<PlanId, number | Text>;
}[] = [
  {
    label: "Domínio .com/.net (anual)",
    values: { starter: 40_000, business: 40_000, premium: 40_000 },
  },
  {
    label: "Domínio .ao (anual)",
    values: { starter: "Sob consulta", business: "Sob consulta", premium: "Sob consulta" },
  },
  {
    label: "Alojamento web (anual)",
    values: { starter: 60_000, business: 100_000, premium: 180_000 },
  },
  {
    label: "E-mail profissional (anual)",
    values: { starter: 30_000, business: 60_000, premium: 120_000 },
  },
  {
    label: "Página adicional",
    values: { starter: 30_000, business: 35_000, premium: 50_000 },
  },
  {
    label: v("Redacção de conteúdos (por página)", "Redação de conteúdos (por página)"),
    values: { starter: 25_000, business: 25_000, premium: 30_000 },
  },
  {
    label: "Logótipo/fotografia",
    values: { starter: "Sob orçamento", business: "Sob orçamento", premium: "Sob orçamento" },
  },
  {
    label: "Integração/funcionalidade",
    values: { starter: "Sob orçamento", business: "Sob orçamento", premium: "Sob orçamento" },
  },
];

export const additionalCostsNote: Text =
  "Estimativas comerciais: o valor final depende do fornecedor, da extensão do domínio, da capacidade de alojamento, das licenças e das condições de renovação.";

export const processSteps: { title: Text; text: Text }[] = [
  {
    title: "Levantamento de requisitos",
    text: v(
      "Necessidades, objectivos, público-alvo e funcionalidades.",
      "Necessidades, objetivos, público-alvo e funcionalidades.",
    ),
  },
  { title: "Proposta e aprovação", text: "Pacote, orçamento, prazo e âmbito." },
  {
    title: "Design e estrutura",
    text: v(
      "Arquitectura do website e apresentação visual.",
      "Arquitetura do website e apresentação visual.",
    ),
  },
  { title: "Desenvolvimento", text: "Páginas, funcionalidades e integrações." },
  { title: "Testes e validação", text: "Verificação funcional e aprovação do cliente." },
  { title: "Publicação", text: "Disponibilização no domínio contratado." },
  { title: "Entrega", text: "Acessos acordados e documentação básica." },
];

export const paymentTerms: { title: Text; text: Text }[] = [
  {
    title: "50% inicial",
    text: "Após aprovação formal da proposta e antes do início dos trabalhos.",
  },
  {
    title: "50% final",
    text: "Após conclusão e validação do website, antes da publicação definitiva ou transferência final, conforme acordado.",
  },
];

export const paymentNote: Text =
  "Domínio, alojamento, licenças e serviços externos poderão ser pagos antecipadamente para contratação junto dos fornecedores.";

export const warranty: Text[] = [
  v(
    "Garantia técnica de 30 dias após a entrega, para correcção de defeitos do âmbito aprovado.",
    "Garantia técnica de 30 dias após a entrega, para correção de defeitos do âmbito aprovado.",
  ),
  "Alterações de requisitos, novas funcionalidades ou mudanças de design não são defeitos e podem ser orçamentadas.",
  "Domínio, alojamento e licenças seguem as condições dos fornecedores.",
];

export const clientProvides: Text[] = [
  "Logótipo e identidade visual",
  "Textos institucionais e fotografias autorizadas",
  "Informações de serviços/produtos",
  v("Contactos e localização", "Contatos e localização"),
  "Aprovações do design e dos conteúdos, e acessos necessários",
];

export const pricingDisclaimer: Text =
  "Valores de referência para Angola, em kwanzas (Kz), sujeitos a confirmação comercial. Não constituem cotação vinculativa. Valores e prazos podem ser ajustados em função da complexidade, requisitos, recursos e serviços externos. Para outros mercados, solicite proposta.";

/** Formata kwanzas como na proposta comercial: «180.000 Kz». */
export function formatKz(value: number): string {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Valor inválido: ${value}`);
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} Kz`;
}

export function formatDeliveryDays({ min, max }: { min: number; max: number }): string {
  return `${min}–${max} dias úteis`;
}
