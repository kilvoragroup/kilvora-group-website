import { publicWhatsapp } from "@/config/contacts";

import { ChatIcon } from "./icons";

/**
 * Botão flutuante de WhatsApp: ligação directa `wa.me`, sem API nem agente IA.
 * Só é apresentado quando o número institucional estiver confirmado em `config/contacts.ts`.
 */
export function WhatsAppButton() {
  const whatsapp = publicWhatsapp();
  if (!whatsapp) return null;

  return (
    <a
      href={whatsapp.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`WhatsApp: ${whatsapp.label}`}
      className="bg-highlight text-highlight-foreground fixed right-4 bottom-4 z-30 inline-flex size-12 items-center justify-center rounded-full shadow-lg sm:right-6 sm:bottom-6"
    >
      <ChatIcon className="size-6" />
    </a>
  );
}
