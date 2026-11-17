import type { TicketEventType, TicketStatus, TicketType } from "@/domain/portal/types";

import { type ContentStatus, type LocalizedText, v } from "./types";

/**
 * Textos da área autenticada do cliente (A3): pedidos, mensagens, histórico, cancelamento,
 * perfil e conta, em pt-AO e pt-BR (D10).
 *
 * Estado provisório (P7): sem revisão editorial; as páginas assinalam «Em validação».
 * As mensagens de erro da base vêm de `src/domain/portal/errors.ts` (fonte única).
 * A autoria das mensagens do staff é sempre «Equipa KILVORA» (D04).
 */

export const portalClientStatus: ContentStatus = "provisorio";

export const ticketStatusLabels: Readonly<Record<TicketStatus, LocalizedText>> = {
  recebido: v("Recebido", "Recebido"),
  em_analise: v("Em análise", "Em análise"),
  aguarda_cliente: v("A aguardar a sua resposta", "Aguardando sua resposta"),
  em_preparacao_proposta: v("Proposta em preparação", "Proposta em preparação"),
  proposta_enviada: v("Proposta enviada", "Proposta enviada"),
  aceite: v("Aceite", "Aceito"),
  recusado: v("Recusado", "Recusado"),
  cancelado: v("Cancelado", "Cancelado"),
  concluido: v("Concluído", "Concluído"),
};

export const ticketTypeLabels: Readonly<Record<TicketType, LocalizedText>> = {
  desenvolvimento_websites: v("Desenvolvimento de website", "Desenvolvimento de site"),
  solucoes_digitais: v("Soluções digitais", "Soluções digitais"),
  consultoria: v("Consultoria", "Consultoria"),
  gestao: v("Gestão", "Gestão"),
  formacao: v("Formação", "Treinamento"),
  comercio: v("Comércio", "Comércio"),
  demonstracao_core: v("Demonstração do Kilvora Core", "Demonstração do Kilvora Core"),
  acesso_demo: v("Acesso de demonstração", "Acesso de demonstração"),
  informacoes_hcm: v("Informações sobre o Kilvora HCM", "Informações sobre o Kilvora HCM"),
  pedido_generico: v("Outro pedido", "Outro pedido"),
};

/** Eventos visíveis ao cliente. `note_added` é sempre interno e nunca chega ao cliente (M3). */
export const ticketEventLabels: Readonly<Record<TicketEventType, LocalizedText>> = {
  created: v("Pedido registado", "Pedido registrado"),
  status_changed: v("Estado alterado", "Status alterado"),
  assigned: v("Pedido encaminhado", "Pedido encaminhado"),
  unassigned: v("Pedido reencaminhado", "Pedido reencaminhado"),
  reopened: v("Pedido reaberto", "Pedido reaberto"),
  message_added: v("Nova mensagem", "Nova mensagem"),
  note_added: v("Actualização interna", "Atualização interna"),
};

export const portalClient = {
  nav: {
    label: v("Área de cliente", "Área do cliente"),
    tickets: v("Os meus pedidos", "Meus pedidos"),
    newTicket: v("Novo pedido", "Novo pedido"),
    account: v("Perfil e conta", "Perfil e conta"),
    signOut: v("Terminar sessão", "Sair"),
  },
  home: {
    title: v("Os meus pedidos", "Meus pedidos"),
    intro: v(
      "Acompanhe os pedidos da sua conta e fale com a equipa KILVORA.",
      "Acompanhe os pedidos da sua conta e fale com a equipe KILVORA.",
    ),
    empty: v(
      "Ainda não tem pedidos. Crie o primeiro para falar connosco.",
      "Você ainda não tem pedidos. Crie o primeiro para falar com a gente.",
    ),
    reference: v("Referência", "Referência"),
    subject: v("Assunto", "Assunto"),
    type: v("Tipo", "Tipo"),
    status: v("Estado", "Status"),
    updated: v("Última actualização", "Última atualização"),
  },
  newTicket: {
    title: v("Novo pedido", "Novo pedido"),
    intro: v(
      "Descreva o que precisa. A equipa KILVORA analisa o pedido e responde nesta área.",
      "Descreva o que você precisa. A equipe KILVORA analisa o pedido e responde nesta área.",
    ),
    type: v("Tipo de pedido", "Tipo de pedido"),
    typePlaceholder: v("Escolha uma opção", "Escolha uma opção"),
    plan: v("Plano de website", "Plano de site"),
    planHint: v(
      "Opcional. Pode escolher um dos planos publicados ou deixar a definir com a equipa.",
      "Opcional. Você pode escolher um dos planos publicados ou deixar para definir com a equipe.",
    ),
    planUndecided: v("Ainda não sei / a definir", "Ainda não sei / a definir"),
    development: v("Desenvolvimento", "Desenvolvimento"),
    maintenance: v("Manutenção", "Manutenção"),
    perMonth: v("/mês", "/mês"),
    subject: v("Assunto", "Assunto"),
    subjectHint: v("Entre 3 e 160 caracteres.", "Entre 3 e 160 caracteres."),
    details: v("Descrição", "Descrição"),
    detailsHint: v(
      "Pelo menos 10 caracteres. Não inclua palavras-passe nem dados de pagamento.",
      "Pelo menos 10 caracteres. Não inclua senhas nem dados de pagamento.",
    ),
    submit: v("Enviar pedido", "Enviar pedido"),
    created: v(
      "Pedido registado. A equipa KILVORA vai analisá-lo.",
      "Pedido registrado. A equipe KILVORA vai analisá-lo.",
    ),
  },
  /** Bloco do plano escolhido, gravado no texto do pedido (fotografia dos valores aprovados). */
  planBlock: {
    plan: v("Plano pretendido", "Plano pretendido"),
    development: v(
      "Desenvolvimento (valor de referência)",
      "Desenvolvimento (valor de referência)",
    ),
    maintenance: v("Manutenção (valor de referência)", "Manutenção (valor de referência)"),
    perMonth: v("/mês", "/mês"),
    notice: v(
      "Valores de referência para Angola, em kwanzas (Kz), sujeitos a confirmação comercial. Não constituem cotação vinculativa.",
      "Valores de referência para Angola, em kwanzas (Kz), sujeitos a confirmação comercial. Não constituem cotação vinculativa.",
    ),
    details: v("Descrição do cliente", "Descrição do cliente"),
  },
  detail: {
    back: v("Voltar aos pedidos", "Voltar aos pedidos"),
    type: v("Tipo", "Tipo"),
    status: v("Estado", "Status"),
    created: v("Criado em", "Criado em"),
    closed: v("Encerrado em", "Encerrado em"),
    description: v("Descrição", "Descrição"),
    messages: v("Mensagens", "Mensagens"),
    noMessages: v("Ainda não há mensagens.", "Ainda não há mensagens."),
    you: v("Você", "Você"),
    team: v("Equipa KILVORA", "Equipe KILVORA"),
    messageLabel: v("Nova mensagem", "Nova mensagem"),
    messageHint: v("Entre 1 e 5000 caracteres.", "Entre 1 e 5000 caracteres."),
    send: v("Enviar mensagem", "Enviar mensagem"),
    sent: v("Mensagem enviada.", "Mensagem enviada."),
    closedNotice: v(
      "Este pedido está encerrado. Para um novo assunto, crie outro pedido.",
      "Este pedido está encerrado. Para um novo assunto, crie outro pedido.",
    ),
    history: v("Histórico", "Histórico"),
    reason: v("Motivo", "Motivo"),
    cancelTitle: v("Cancelar pedido", "Cancelar pedido"),
    cancelIntro: v(
      "O cancelamento encerra o pedido e não pode ser desfeito por si.",
      "O cancelamento encerra o pedido e não pode ser desfeito por você.",
    ),
    cancelReason: v("Motivo (opcional)", "Motivo (opcional)"),
    cancelSubmit: v("Cancelar pedido", "Cancelar pedido"),
    cancelled: v("Pedido cancelado.", "Pedido cancelado."),
  },
  account: {
    title: v("Perfil e conta", "Perfil e conta"),
    intro: v(
      "Actualize os seus dados de contacto e os dados da sua conta.",
      "Atualize seus dados de contato e os dados da sua conta.",
    ),
    profileTitle: v("Perfil", "Perfil"),
    fullName: v("Nome completo", "Nome completo"),
    phone: v("Telefone (opcional)", "Telefone (opcional)"),
    phoneHint: v("Por exemplo, +244 923 000 000.", "Por exemplo, +55 11 90000-0000."),
    locale: v("Variante de português", "Variante de português"),
    localeAO: v("Português de Angola", "Português de Angola"),
    localeBR: v("Português do Brasil", "Português do Brasil"),
    saveProfile: v("Guardar perfil", "Salvar perfil"),
    profileSaved: v("Perfil actualizado.", "Perfil atualizado."),
    accountTitle: v("Conta", "Conta"),
    accountName: v("Nome da conta", "Nome da conta"),
    country: v("País (código de 2 letras, opcional)", "País (código de 2 letras, opcional)"),
    countryHint: v("Por exemplo, AO ou BR.", "Por exemplo, AO ou BR."),
    sector: v("Sector de actividade (opcional)", "Setor de atividade (opcional)"),
    saveAccount: v("Guardar conta", "Salvar conta"),
    accountSaved: v("Conta actualizada.", "Conta atualizada."),
    notOwner: v(
      "Só o titular pode alterar os dados da conta.",
      "Só o titular pode alterar os dados da conta.",
    ),
    noAccount: v(
      "Não há nenhuma conta activa associada ao seu perfil.",
      "Não há nenhuma conta ativa associada ao seu perfil.",
    ),
  },
  fields: {
    required: v("Preencha este campo.", "Preencha este campo."),
    type: v("Escolha o tipo de pedido.", "Escolha o tipo de pedido."),
    plan: v("Escolha um plano válido, ou «a definir».", "Escolha um plano válido, ou «a definir»."),
    planNotAllowed: v(
      "Só os pedidos de website podem indicar um plano.",
      "Só os pedidos de site podem indicar um plano.",
    ),
    subject: v(
      "O assunto deve ter entre 3 e 160 caracteres.",
      "O assunto deve ter entre 3 e 160 caracteres.",
    ),
    details: v(
      "A descrição deve ter pelo menos 10 caracteres e caber no limite do pedido.",
      "A descrição deve ter pelo menos 10 caracteres e caber no limite do pedido.",
    ),
    body: v(
      "A mensagem deve ter entre 1 e 5000 caracteres.",
      "A mensagem deve ter entre 1 e 5000 caracteres.",
    ),
    reason: v(
      "O motivo pode ter no máximo 1000 caracteres.",
      "O motivo pode ter no máximo 1000 caracteres.",
    ),
    fullName: v(
      "O nome deve ter entre 1 e 120 caracteres.",
      "O nome deve ter entre 1 e 120 caracteres.",
    ),
    phone: v("Telefone inválido.", "Telefone inválido."),
    locale: v("Escolha uma variante.", "Escolha uma variante."),
    accountName: v(
      "O nome da conta deve ter entre 1 e 160 caracteres.",
      "O nome da conta deve ter entre 1 e 160 caracteres.",
    ),
    country: v(
      "Use o código de 2 letras do país (por exemplo, AO).",
      "Use o código de 2 letras do país (por exemplo, BR).",
    ),
    sector: v(
      "O sector deve ter no máximo 80 caracteres.",
      "O setor deve ter no máximo 80 caracteres.",
    ),
    // Consola interna (A4)
    toStatus: v("Escolha um novo estado permitido.", "Escolha um novo status permitido."),
    reasonRequired: v("Indique o motivo.", "Informe o motivo."),
    evidenceRef: v(
      "A referência da evidência pode ter no máximo 300 caracteres.",
      "A referência da evidência pode ter no máximo 300 caracteres.",
    ),
    evidenceRequired: v(
      "Indique a referência da evidência (por exemplo, o documento da proposta).",
      "Informe a referência da evidência (por exemplo, o documento da proposta).",
    ),
    totp: v(
      "Introduza o código de 6 algarismos da aplicação autenticadora.",
      "Digite o código de 6 dígitos do aplicativo autenticador.",
    ),
  },
} as const;

export type PortalFieldKey = keyof typeof portalClient.fields;
