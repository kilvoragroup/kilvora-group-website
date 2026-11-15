import { type ContentStatus, v } from "./types";

/**
 * Textos da autenticação do portal de clientes (A2-B3), em pt-AO e pt-BR.
 *
 * Estado provisório (P7): sem revisão editorial; as páginas assinalam «Em validação».
 * As mensagens de erro vêm de `src/domain/portal/auth-errors.ts` (fonte única).
 *
 * Regras de redacção: nunca confirmar nem negar a existência de contas; só indicar sucesso
 * depois de o Auth ter aceite o pedido; mensagens condicionais quando o envio não é garantido.
 */

export const portalAuthStatus: ContentStatus = "provisorio";

export const portalAuth = {
  common: {
    email: v("E-mail", "E-mail"),
    password: v("Palavra-passe", "Senha"),
    newPassword: v("Nova palavra-passe", "Nova senha"),
    passwordConfirmation: v("Confirmar palavra-passe", "Confirmar senha"),
    passwordHint: v(
      "Pelo menos 12 caracteres, com maiúsculas, minúsculas e algarismos.",
      "Pelo menos 12 caracteres, com letras maiúsculas, minúsculas e números.",
    ),
    required: v("obrigatório", "obrigatório"),
    sending: v("A enviar…", "Enviando…"),
    formErrorsTitle: v(
      "Não foi possível concluir o pedido.",
      "Não foi possível concluir o pedido.",
    ),
    backToSite: v("Voltar ao website", "Voltar ao site"),
  },
  signIn: {
    title: v("Entrar na área de cliente", "Entrar na área do cliente"),
    intro: v("Aceda aos seus pedidos e à sua conta.", "Acesse seus pedidos e sua conta."),
    submit: v("Entrar", "Entrar"),
    forgot: v("Esqueceu-se da palavra-passe?", "Esqueceu a senha?"),
    noAccount: v("Ainda não tem conta? Criar conta", "Ainda não tem conta? Criar conta"),
  },
  signUp: {
    title: v("Criar conta de cliente", "Criar conta de cliente"),
    intro: v(
      "Registe-se para acompanhar os seus pedidos à KILVORA GROUP.",
      "Cadastre-se para acompanhar seus pedidos à KILVORA GROUP.",
    ),
    fullName: v("Nome completo", "Nome completo"),
    company: v("Empresa (opcional)", "Empresa (opcional)"),
    companyHint: v(
      "Se indicar, será o nome da sua conta.",
      "Se informar, será o nome da sua conta.",
    ),
    submit: v("Criar conta", "Criar conta"),
    success: v(
      "Pedido de registo recebido. Se o endereço puder ser usado, receberá um e-mail com um link de confirmação. Abra-o neste navegador.",
      "Pedido de cadastro recebido. Se o endereço puder ser usado, você receberá um e-mail com um link de confirmação. Abra-o neste navegador.",
    ),
    hasAccount: v("Já tem conta? Entrar", "Já tem conta? Entrar"),
  },
  recovery: {
    title: v("Recuperar acesso", "Recuperar acesso"),
    intro: v(
      "Indique o e-mail da sua conta. Enviaremos um link para definir uma nova palavra-passe.",
      "Informe o e-mail da sua conta. Enviaremos um link para definir uma nova senha.",
    ),
    submit: v("Enviar link", "Enviar link"),
    success: v(
      "Se existir uma conta com este e-mail, enviámos um link de recuperação válido por tempo limitado. Abra-o neste navegador.",
      "Se existir uma conta com este e-mail, enviamos um link de recuperação válido por tempo limitado. Abra-o neste navegador.",
    ),
    back: v("Voltar à entrada", "Voltar para a entrada"),
  },
  newPassword: {
    title: v("Definir nova palavra-passe", "Definir nova senha"),
    intro: v(
      "Escolha uma nova palavra-passe. Depois, entre novamente com ela.",
      "Escolha uma nova senha. Depois, entre novamente com ela.",
    ),
    submit: v("Guardar palavra-passe", "Salvar senha"),
    recoveryRequired: v(
      "Para definir uma nova palavra-passe, abra o link de recuperação enviado por e-mail. O link é válido durante pouco tempo.",
      "Para definir uma nova senha, abra o link de recuperação enviado por e-mail. O link é válido por pouco tempo.",
    ),
    requestNew: v("Pedir novo link", "Solicitar novo link"),
  },
  home: {
    title: v("Área de cliente", "Área do cliente"),
    intro: v(
      "A sua sessão está iniciada. Os pedidos e a conta ficam disponíveis numa próxima fase.",
      "Sua sessão está iniciada. Os pedidos e a conta ficam disponíveis em uma próxima fase.",
    ),
    signedInAs: v("Sessão iniciada como", "Sessão iniciada como"),
    signOut: v("Terminar sessão", "Sair"),
  },
  loading: v("A carregar…", "Carregando…"),
  /** Avisos por chave fechada (`?aviso=`). Chaves desconhecidas são ignoradas. */
  notices: {
    "link-invalido": {
      tone: "error",
      text: v(
        "O link é inválido ou expirou. Peça um novo e abra-o neste navegador.",
        "O link é inválido ou expirou. Solicite um novo e abra-o neste navegador.",
      ),
    },
    "palavra-passe-alterada": {
      tone: "success",
      text: v(
        "Palavra-passe alterada. Entre com a nova palavra-passe.",
        "Senha alterada. Entre com a nova senha.",
      ),
    },
    "sessao-terminada": {
      tone: "success",
      text: v("Sessão terminada.", "Sessão encerrada."),
    },
    indisponivel: {
      tone: "error",
      text: v(
        "O serviço está temporariamente indisponível. Tente novamente dentro de instantes.",
        "O serviço está temporariamente indisponível. Tente novamente em instantes.",
      ),
    },
  },
} as const;

export type PortalNoticeKey = keyof typeof portalAuth.notices;

export function isPortalNoticeKey(value: unknown): value is PortalNoticeKey {
  return typeof value === "string" && Object.hasOwn(portalAuth.notices, value);
}
