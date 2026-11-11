/**
 * Fonte única de contactos públicos.
 *
 * Só contactos com `status: "aprovado"` são apresentados no site.
 * Nunca acrescentar contactos sem confirmação documental do proprietário.
 *
 * - Email: aprovado em materiais comerciais anteriores (Plano Director §8).
 * - WhatsApp: número indicado na proposta comercial, mas o Plano Director §8 exige
 *   confirmar titularidade e formatação → provisório (não publicado).
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
    value: "+55 47 98457-5883",
    status: "provisorio",
    source: "Proposta comercial (p. 17); titularidade por confirmar (Plano Director §8)",
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

/** WhatsApp publicável, ou `null` enquanto o número não estiver confirmado. */
export function publicWhatsapp(): { label: string; href: string } | null {
  const contact: Contact = contacts.whatsapp;
  if (!isPublic(contact)) return null;
  return { label: contact.value, href: whatsappHref(contact.value) };
}
