import { cx } from "@/lib/cx";

/**
 * MARCA NOMINATIVA PROVISÓRIA «KILVORA GROUP».
 *
 * Substitui temporariamente o logótipo oficial, que só existe em PNG 3D sem
 * transparência (inutilizável na web). Trocar por SVG aprovado quando disponível.
 * Os filetes verde/laranja evocam o logótipo sem o reproduzir.
 */
export function BrandWordmark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex flex-col leading-none" data-brand="provisorio">
      <span className="tracking-brand text-lg font-bold">KILVORA</span>
      <span className="mt-1 flex items-center gap-1.5" aria-hidden="true">
        <span className="bg-highlight h-0.5 w-4" />
        <span
          className={cx(
            "text-micro tracking-brand-wide font-semibold",
            inverse ? "text-inverse-muted" : "text-muted-foreground",
          )}
        >
          GROUP
        </span>
        <span className="bg-accent h-0.5 w-4" />
      </span>
      <span className="sr-only">GROUP</span>
    </span>
  );
}
