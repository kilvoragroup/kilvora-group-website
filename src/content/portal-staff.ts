import { type ContentStatus, v } from "./types";

/**
 * Textos da consola interna (A4) em pt-AO e pt-BR (D10). Uso interno da equipa KILVORA.
 * Estado provisório (P7): as páginas assinalam «Em validação».
 * Estados, tipos e eventos reutilizam os rótulos de `portal-client.ts`.
 */

export const portalStaffStatus: ContentStatus = "provisorio";

export const portalStaff = {
  nav: {
    label: v("Consola interna", "Console interno"),
    tickets: v("Pedidos", "Pedidos"),
    signOut: v("Terminar sessão", "Sair"),
  },
  home: {
    title: v("Consola interna — pedidos", "Console interno — pedidos"),
    introOperator: v("Pedidos atribuídos a si.", "Pedidos atribuídos a você."),
    introAdmin: v("Todos os pedidos (administrador).", "Todos os pedidos (administrador)."),
    empty: v("Não há pedidos para mostrar.", "Não há pedidos para mostrar."),
    unassigned: v("Sem operador atribuído", "Sem operador atribuído"),
    updated: v("Última actualização", "Última atualização"),
  },
  mfa: {
    title: v("Verificação em dois passos", "Verificação em duas etapas"),
    intro: v(
      "A consola interna exige verificação em dois passos (TOTP) em cada sessão.",
      "O console interno exige verificação em duas etapas (TOTP) em cada sessão.",
    ),
    enrollTitle: v("Configurar a aplicação autenticadora", "Configurar o aplicativo autenticador"),
    enrollIntro: v(
      "Leia o código QR com uma aplicação autenticadora (TOTP) ou introduza a chave manualmente. Depois, confirme com o código de 6 algarismos.",
      "Leia o QR code com um aplicativo autenticador (TOTP) ou digite a chave manualmente. Depois, confirme com o código de 6 dígitos.",
    ),
    start: v("Gerar código QR", "Gerar QR code"),
    secret: v("Chave para introdução manual", "Chave para digitação manual"),
    qrAlt: v(
      "Código QR para configurar a aplicação autenticadora",
      "QR code para configurar o aplicativo autenticador",
    ),
    verifyTitle: v("Introduzir código", "Digitar código"),
    code: v("Código de 6 algarismos", "Código de 6 dígitos"),
    verify: v("Verificar", "Verificar"),
    failed: v(
      "Código inválido ou expirado. Tente novamente.",
      "Código inválido ou expirado. Tente novamente.",
    ),
    unavailable: v(
      "Não foi possível iniciar a verificação. Tente novamente dentro de instantes.",
      "Não foi possível iniciar a verificação. Tente novamente em instantes.",
    ),
  },
  detail: {
    back: v("Voltar aos pedidos", "Voltar aos pedidos"),
    reference: v("Referência", "Referência"),
    status: v("Estado", "Status"),
    type: v("Tipo", "Tipo"),
    created: v("Criado em", "Criado em"),
    description: v("Descrição", "Descrição"),
    requester: v("Requerente", "Solicitante"),
    phone: v("Telefone", "Telefone"),
    account: v("Conta", "Conta"),
    country: v("País", "País"),
    sector: v("Sector", "Setor"),
    notProvided: v("Não indicado", "Não informado"),
    messages: v("Mensagens com o cliente", "Mensagens com o cliente"),
    noMessages: v("Ainda não há mensagens.", "Ainda não há mensagens."),
    you: v("Você", "Você"),
    client: v("Cliente", "Cliente"),
    team: v("Equipa KILVORA", "Equipe KILVORA"),
    messageLabel: v("Mensagem para o cliente", "Mensagem para o cliente"),
    messageHint: v(
      "Visível para o cliente. Entre 1 e 5000 caracteres.",
      "Visível para o cliente. Entre 1 e 5000 caracteres.",
    ),
    send: v("Enviar mensagem", "Enviar mensagem"),
    sent: v("Mensagem enviada.", "Mensagem enviada."),
    notes: v("Notas internas", "Notas internas"),
    notesHint: v("Nunca visíveis para o cliente.", "Nunca visíveis para o cliente."),
    noNotes: v("Sem notas internas.", "Sem notas internas."),
    noteLabel: v("Nova nota interna", "Nova nota interna"),
    addNote: v("Adicionar nota", "Adicionar nota"),
    noteAdded: v("Nota interna adicionada.", "Nota interna adicionada."),
    closed: v(
      "Pedido encerrado: sem mensagens nem transições (a reabertura é do administrador).",
      "Pedido encerrado: sem mensagens nem transições (a reabertura é do administrador).",
    ),
    transition: v("Mudar estado", "Mudar status"),
    toStatus: v("Novo estado", "Novo status"),
    toStatusPlaceholder: v("Escolha uma opção", "Escolha uma opção"),
    reason: v("Motivo", "Motivo"),
    reasonHint: v(
      "Obrigatório para recusar ou cancelar. Visível para o cliente no histórico.",
      "Obrigatório para recusar ou cancelar. Visível para o cliente no histórico.",
    ),
    evidence: v("Referência da evidência", "Referência da evidência"),
    evidenceHint: v(
      "Obrigatória para aceite ou recusa de proposta. Nunca visível para o cliente.",
      "Obrigatória para aceite ou recusa de proposta. Nunca visível para o cliente.",
    ),
    apply: v("Aplicar", "Aplicar"),
    applied: v("Estado actualizado.", "Status atualizado."),
    noTransitions: v(
      "Não há transições disponíveis a partir deste estado.",
      "Não há transições disponíveis a partir deste status.",
    ),
    history: v("Histórico completo", "Histórico completo"),
    internalTag: v("interno", "interno"),
    evidenceLabel: v("Evidência", "Evidência"),
  },
} as const;
