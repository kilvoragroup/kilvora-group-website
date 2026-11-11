import { LinkButton } from "@/components/button";
import { Hero } from "@/components/hero";
import { ChatIcon, MailIcon } from "@/components/icons";
import { Section } from "@/components/section";
import { contacts, isPublic, mailtoHref, publicWhatsapp } from "@/config/contacts";
import { getContent } from "@/content";
import { pageMetadata } from "@/lib/metadata";

const { pages } = getContent();

export const metadata = pageMetadata({
  title: pages.contacts.title,
  description: pages.contacts.description,
  path: "/contactos",
});

/**
 * Contactos: apenas canais aprovados em `config/contacts.ts`.
 * Sem formulário nesta fase (formulários reais em W4) — o pedido é feito por email.
 */
export default function ContactsPage() {
  const { common, proposalRequest } = getContent();
  const whatsapp = publicWhatsapp();
  const email = isPublic(contacts.email) ? contacts.email.value : null;

  return (
    <>
      <Hero
        eyebrow="KILVORA GROUP"
        title={pages.contacts.title}
        description={pages.contacts.intro}
      />

      <Section id="canais" title={pages.contacts.title}>
        <ul className="grid gap-4 md:grid-cols-2">
          {email && (
            <li className="border-border flex gap-4 rounded-xl border p-6">
              <MailIcon className="text-primary size-6 shrink-0" />
              <div>
                <h3 className="font-semibold">Email</h3>
                <a
                  href={mailtoHref()}
                  className="text-primary mt-1 inline-block break-all underline underline-offset-4"
                >
                  {email}
                </a>
              </div>
            </li>
          )}
          {whatsapp && (
            <li className="border-border flex gap-4 rounded-xl border p-6">
              <ChatIcon className="text-primary size-6 shrink-0" />
              <div>
                <h3 className="font-semibold">WhatsApp</h3>
                <a
                  href={whatsapp.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary mt-1 inline-block underline underline-offset-4"
                >
                  {whatsapp.label}
                </a>
              </div>
            </li>
          )}
        </ul>
      </Section>

      {email && (
        <Section
          id="proposta"
          tone="muted"
          title={proposalRequest.title}
          intro={proposalRequest.intro}
        >
          <ul className="grid max-w-3xl gap-2 sm:grid-cols-2">
            {proposalRequest.fields.map((field) => (
              <li key={field} className="flex gap-3">
                <span aria-hidden="true" className="bg-highlight mt-2.5 h-0.5 w-4 shrink-0" />
                <span>{field}</span>
              </li>
            ))}
          </ul>
          <LinkButton
            href={mailtoHref(proposalRequest.emailSubject)}
            variant="accent"
            size="lg"
            className="mt-8"
          >
            <MailIcon className="size-5" />
            {common.cta.sendEmail}
          </LinkButton>
        </Section>
      )}
    </>
  );
}
