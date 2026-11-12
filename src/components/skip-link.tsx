export function SkipLink({ label, target = "conteudo" }: { label: string; target?: string }) {
  return (
    <a
      href={`#${target}`}
      className="bg-accent text-accent-foreground sr-only z-50 rounded-md px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {label}
    </a>
  );
}
