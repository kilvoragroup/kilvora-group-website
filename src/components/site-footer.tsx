import Link from "next/link";

import { contacts, isPublic, mailtoHref, publicWhatsapp } from "@/config/contacts";
import { getNavigation } from "@/config/navigation";
import { site } from "@/config/site";
import { getContent } from "@/content";

import { BrandWordmark } from "./brand-wordmark";
import { Container } from "./container";

const footerLink =
  "text-inverse-muted hover:text-inverse-foreground underline-offset-4 hover:underline";

export function SiteFooter() {
  const { main } = getNavigation();
  const { common } = getContent();
  const whatsapp = publicWhatsapp();
  const groups = main.filter((item) => item.children?.length);
  const pagesLinks = main.filter((item) => !item.children?.length);

  return (
    <footer data-tone="inverse" className="bg-inverse text-inverse-foreground">
      <div aria-hidden="true" className="flex h-1">
        <span className="bg-highlight w-2/3" />
        <span className="bg-accent w-1/3" />
      </div>
      <Container className="grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BrandWordmark inverse />
          <p className="mt-6 font-semibold">{site.signature}</p>
          <p className="text-inverse-muted mt-2 max-w-sm">{site.tagline}</p>
        </div>

        {groups.map((group) => (
          <nav key={group.id} aria-labelledby={`rodape-${group.id}`}>
            <h2 id={`rodape-${group.id}`} className="text-sm font-semibold">
              {group.label}
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {group.children?.map((child) => (
                <li key={child.href}>
                  <Link href={child.href} className={footerLink}>
                    {child.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-1">
          <nav aria-labelledby="rodape-empresa">
            <h2 id="rodape-empresa" className="text-sm font-semibold">
              {common.footer.company}
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {pagesLinks.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className={footerLink}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="text-sm font-semibold">{common.footer.contact}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {isPublic(contacts.email) && (
                <li>
                  <a href={mailtoHref()} className={`${footerLink} break-all`}>
                    {contacts.email.value}
                  </a>
                </li>
              )}
              {whatsapp && (
                <li>
                  <a
                    href={whatsapp.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={footerLink}
                  >
                    WhatsApp {whatsapp.label}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
      </Container>
      <div className="border-inverse-foreground/15 border-t">
        <Container className="text-inverse-muted flex flex-col gap-2 py-6 text-sm sm:flex-row sm:justify-between">
          <p>© {common.footer.rights}</p>
          <p>{common.footer.provisionalBrand}</p>
        </Container>
      </div>
    </footer>
  );
}
