/**
 * Fonte única de contactos públicos.
 *
 * Só contactos com `status: "aprovado"` são apresentados no site.
 * Nunca acrescentar contactos sem confirmação documental do proprietário.
 *
 * - Email: aprovado em materiais comerciais anteriores (Plano Director §8).
 * - WhatsApp: ainda não aprovado como contacto oficial (Plano Director §8 exige confirmar
 *   titularidade e formatação). O número não é guardado no repositório até à confirmação.
 *   Para activar: preencher `value` com o número confirmado e mudar `status` para "aprovado".
 * - Morada: não confirmada para publicação → não incluída.
 */
import type { ContentStatus } from "@/content/types";

export type Contact = {
  readonly value: string;
  readonly status: ContentStatus;
  readonly source: string;
};

export const contacts = {
  email: {
    value: "admin.kilvoragroup@gmail.com",
    status: "aprovado",
    source: "Plano Director v1.0 §8; Proposta comercial (p. 17)",
  },
  whatsapp: {
    value: "",
    status: "provisorio",
    source: "Por confirmar pelo proprietário (Plano Director §8)",
  },
} as const satisfies Record<string, Contact>;

export function isPublic(contact: Contact): boolean {
  return contact.status === "aprovado";
}

/** Link `mailto:` com assunto opcional. */
export function mailtoHref(subject?: string): string {
  const base = `mailto:${contacts.email.value}`;
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base;
}

/** Link directo `wa.me` (sem API, sem mensagens automáticas). */
export function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

/** WhatsApp publicável, ou `null` enquanto o número não estiver confirmado e preenchido. */
export function publicWhatsapp(
  contact: Contact = contacts.whatsapp,
): { label: string; href: string } | null {
  if (!isPublic(contact) || contact.value.trim() === "") return null;
  return { label: contact.value, href: whatsappHref(contact.value) };
}
