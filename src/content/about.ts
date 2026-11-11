/**
 * Conteúdo institucional. Fonte: Dossiê institucional v1.0 (§1, §3–§6).
 * A narrativa de origem do nome e os dados do fundador não são publicados
 * (o próprio dossiê exige validação linguística prévia — §2.2).
 */
import { v, type ContentStatus, type Text } from "./types";

export const about = {
  status: "aprovado" as ContentStatus,
  source: "Dossiê institucional §1, §3–§6",
  presentation: [
    v(
      "A KILVORA GROUP é uma iniciativa empresarial concebida para desenvolver, integrar e prestar serviços em diferentes sectores da economia, com especial atenção à tecnologia, consultoria, gestão, comércio, inovação, formação profissional e desenvolvimento de soluções empresariais.",
      "A KILVORA GROUP é uma iniciativa empresarial concebida para desenvolver, integrar e prestar serviços em diferentes setores da economia, com especial atenção à tecnologia, consultoria, gestão, comércio, inovação, formação profissional e desenvolvimento de soluções empresariais.",
    ),
    "A sua proposta de valor assenta na capacidade de aproximar pessoas, empresas, tecnologias, conhecimentos e oportunidades, promovendo relações comerciais sustentáveis e parcerias orientadas para resultados.",
    "Com uma visão de crescimento progressivo e internacionalização, a KILVORA GROUP pretende construir uma identidade empresarial que associe confiança, competência, responsabilidade, inovação e excelência operacional.",
  ] as Text[],
  mission: v(
    "Conectar pessoas, empresas, tecnologias e oportunidades através da prestação de serviços de qualidade, do desenvolvimento de soluções inovadoras, da consultoria, da gestão e da criação de parcerias estratégicas, contribuindo para o crescimento sustentável dos seus clientes e das comunidades em que actua.",
    "Conectar pessoas, empresas, tecnologias e oportunidades através da prestação de serviços de qualidade, do desenvolvimento de soluções inovadoras, da consultoria, da gestão e da criação de parcerias estratégicas, contribuindo para o crescimento sustentável dos seus clientes e das comunidades em que atua.",
  ),
  vision:
    "Ser um grupo empresarial reconhecido pela sua credibilidade, capacidade de inovação, excelência na prestação de serviços e aptidão para integrar diferentes áreas de negócio, construindo uma presença sustentável no Brasil, em Angola e noutros mercados internacionais.",
  values: [
    {
      title: "União e colaboração",
      text: v(
        "Acreditamos que a criação de valor é fortalecida pela cooperação entre pessoas, empresas, instituições e parceiros. Procuramos estabelecer relações baseadas no respeito mútuo e em objectivos partilhados.",
        "Acreditamos que a criação de valor é fortalecida pela cooperação entre pessoas, empresas, instituições e parceiros. Procuramos estabelecer relações baseadas no respeito mútuo e em objetivos partilhados.",
      ),
    },
    {
      title: "Integridade e ética",
      text: v(
        "Assumimos o compromisso de actuar com honestidade, transparência, responsabilidade e respeito pelas leis, pelos contratos e pelos direitos das pessoas.",
        "Assumimos o compromisso de atuar com honestidade, transparência, responsabilidade e respeito pelas leis, pelos contratos e pelos direitos das pessoas.",
      ),
    },
    {
      title: "Excelência e qualidade",
      text: "Procuramos prestar serviços consistentes, cumprir compromissos e melhorar continuamente os nossos processos, produtos e resultados.",
    },
    {
      title: "Inovação e transformação",
      text: "Valorizamos a criatividade, a tecnologia, o conhecimento e a capacidade de transformar desafios em soluções úteis e sustentáveis.",
    },
    {
      title: "Confiança e compromisso",
      text: v(
        "Construímos relações empresariais através do cumprimento da palavra, da comunicação clara, da protecção da informação e da responsabilidade perante os clientes e parceiros.",
        "Construímos relações empresariais através do cumprimento da palavra, da comunicação clara, da proteção da informação e da responsabilidade perante os clientes e parceiros.",
      ),
    },
    {
      title: "Crescimento sustentável",
      text: v(
        "Promovemos o desenvolvimento económico com visão de longo prazo, utilização responsável dos recursos e consideração pelos impactos sociais e ambientais das nossas actividades.",
        "Promovemos o desenvolvimento econômico com visão de longo prazo, utilização responsável dos recursos e consideração pelos impactos sociais e ambientais das nossas atividades.",
      ),
    },
    {
      title: "Diversidade e respeito cultural",
      text: "Reconhecemos a importância das diferentes culturas, experiências e perspectivas, valorizando a identidade africana e a cooperação entre mercados internacionais.",
    },
    {
      title: "Orientação para resultados",
      text: v(
        "Procuramos compreender as necessidades dos clientes, estabelecer objectivos claros e desenvolver soluções adequadas, mensuráveis e proporcionais aos recursos disponíveis.",
        "Procuramos compreender as necessidades dos clientes, estabelecer objetivos claros e desenvolver soluções adequadas, mensuráveis e proporcionais aos recursos disponíveis.",
      ),
    },
    {
      title: "Aprendizagem contínua",
      text: "Incentivamos a formação, a partilha de conhecimento e o desenvolvimento de competências como fundamentos da evolução individual e empresarial.",
    },
    {
      title: "Responsabilidade social",
      text: "Pretendemos contribuir para a criação de oportunidades, a valorização de competências e o desenvolvimento das comunidades com as quais estabelecemos relações.",
    },
  ] as { title: Text; text: Text }[],
  positioning: v(
    "A KILVORA GROUP posiciona-se como uma marca empresarial multissectorial orientada para a integração de serviços, a inovação, a eficiência e o desenvolvimento de negócios.",
    "A KILVORA GROUP posiciona-se como uma marca empresarial multissetorial orientada para a integração de serviços, a inovação, a eficiência e o desenvolvimento de negócios.",
  ),
  differentiators: [
    v(
      "Capacidade de actuação em diferentes sectores.",
      "Capacidade de atuação em diferentes setores.",
    ),
    "Integração entre tecnologia, gestão e operações.",
    "Abordagem orientada para as necessidades concretas dos clientes.",
    "Construção de relações de confiança e parcerias duradouras.",
    "Valorização de oportunidades entre Angola, Brasil e outros mercados.",
    "Compromisso com a melhoria contínua e o desenvolvimento sustentável.",
  ] as Text[],
  markets: ["Angola", "Brasil", "Mercados internacionais"] as Text[],
};
