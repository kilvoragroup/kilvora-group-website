import { LinkButton } from "@/components/button";
import { Container } from "@/components/container";
import { getContent } from "@/content";

export default function NotFound() {
  const { common } = getContent();
  return (
    <Container className="py-section">
      <p className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">404</p>
      <h1 className="text-heading mt-3 font-semibold">{common.notFound.title}</h1>
      <p className="text-muted-foreground text-lead mt-4 max-w-prose">{common.notFound.text}</p>
      <LinkButton href="/" variant="primary" className="mt-8">
        {common.notFound.back}
      </LinkButton>
    </Container>
  );
}
