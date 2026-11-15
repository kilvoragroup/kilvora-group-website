import { E2E_EMAIL_DOMAIN } from "./data";

/**
 * Leitura dos e-mails sintéticos no Mailpit LOCAL (API REST, sem dependências).
 * Só endereços `@e2e.example.test` são consultados ou apagados.
 */

type MailSummary = { ID: string; Created: string; Subject: string };

function assertSynthetic(address: string) {
  if (!address.endsWith(`@${E2E_EMAIL_DOMAIN}`)) {
    throw new Error("Mailpit: só endereços sintéticos são permitidos.");
  }
}

async function search(mailpitUrl: string, address: string): Promise<MailSummary[]> {
  const url = new URL("/api/v1/search", mailpitUrl);
  url.searchParams.set("query", `to:"${address}"`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mailpit: pesquisa falhou (${response.status}).`);
  const body = (await response.json()) as { messages?: MailSummary[] };
  return body.messages ?? [];
}

/** Links do GoTrue (`/auth/v1/verify`) presentes numa mensagem. */
export function extractVerifyLinks(content: string): string[] {
  const decoded = content.replace(/&amp;/g, "&");
  const links = decoded.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/g) ?? [];
  return [...new Set(links)];
}

/**
 * Espera por uma NOVA mensagem para o endereço (ignorando as `seen`) e devolve o link de
 * verificação. Falha ao fim de `timeoutMs`.
 */
export async function waitForVerifyLink(
  mailpitUrl: string,
  address: string,
  seen: ReadonlySet<string> = new Set(),
  timeoutMs = 30_000,
): Promise<{ id: string; link: string }> {
  assertSynthetic(address);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fresh = (await search(mailpitUrl, address)).filter((m) => !seen.has(m.ID));
    for (const message of fresh) {
      const response = await fetch(new URL(`/api/v1/message/${message.ID}`, mailpitUrl));
      if (!response.ok) continue;
      const body = (await response.json()) as { HTML?: string; Text?: string };
      const [link] = extractVerifyLinks(`${body.Text ?? ""}\n${body.HTML ?? ""}`);
      if (link) return { id: message.ID, link };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Mailpit: nenhuma mensagem nova com link de verificação no prazo.");
}

/** IDs das mensagens já existentes para o endereço. */
export async function messageIds(mailpitUrl: string, address: string): Promise<Set<string>> {
  assertSynthetic(address);
  return new Set((await search(mailpitUrl, address)).map((m) => m.ID));
}

/** Apaga as mensagens dos endereços sintéticos indicados (limpeza do Mailpit, não da base). */
export async function deleteMessagesFor(mailpitUrl: string, addresses: string[]): Promise<number> {
  const ids: string[] = [];
  for (const address of addresses) ids.push(...(await messageIds(mailpitUrl, address)));
  if (ids.length === 0) return 0;
  const response = await fetch(new URL("/api/v1/messages", mailpitUrl), {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  });
  if (!response.ok) throw new Error(`Mailpit: remoção falhou (${response.status}).`);
  return ids.length;
}
