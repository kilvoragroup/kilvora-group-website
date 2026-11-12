# Design system

**Estado:** identidade institucional **provisória** (W2-B). A paleta segue a proposta do dossiê e do Plano Director, mas aguarda manual de marca, logótipo vectorial e tipografia oficial.

## Decisões

1. **Fonte única de tokens:** [`src/styles/tokens.css`](../../src/styles/tokens.css). Os componentes não usam cores, raios ou tamanhos literais (`#hex`, `zinc-600`, `[13px]`); usam só utilitários semânticos.
2. **Duas camadas:**
   - As variáveis `--ds-*` em `:root` contêm os valores e mudam por tema.
   - O bloco `@theme inline` expõe-nas ao Tailwind CSS v4 como utilitários (`bg-primary`, `bg-accent`, …).
3. **Temas:** o claro é o padrão e o escuro segue `prefers-color-scheme`. É possível forçar com `data-theme="light|dark"` no `<html>`.
4. **Paleta (hex, provisória):** navy `#0B1F3A` (dominante), verde `#16A34A` (acento), laranja `#F28C28` (chamadas à acção), açafrão `#E5A823` (só no `warning`).
5. **Regras de contraste (WCAG AA, testadas automaticamente):**
   - O laranja (`accent`) leva sempre texto navy (`accent-foreground`, 6,7:1). Com texto branco ficaria em 2,45:1.
   - O verde de marca (`highlight`) usa-se só em elementos gráficos (3,3:1 sobre branco) ou com texto navy.
   - As superfícies navy (`inverse`) levam `data-tone="inverse"`, que muda o anel de foco para laranja.
6. **Marca nominativa provisória** «KILVORA GROUP» (`components/brand-wordmark.tsx`), com filetes verde e laranja. Não se usa o PNG 3D, que não tem transparência. O ícone `app/icon.svg` também é provisório.
7. **Foco acessível:** `:focus-visible` global, com contorno de 2px e afastamento de 2px.
8. **Movimento reduzido:** `prefers-reduced-motion` é respeitado globalmente; o scroll suave só se activa sem essa preferência.
9. **Âncoras:** `scroll-margin-top: var(--spacing-anchor)` compensa o cabeçalho e a navegação contextual fixos.
10. **Sem bibliotecas de UI** e sem elementos visuais de terceiros, incluindo os da SAP.

## Tokens

| Grupo               | Utilitários Tailwind                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superfícies e texto | `background`, `foreground`, `surface`, `surface-foreground`, `muted`, `muted-foreground`, `border`, `input`                                                             |
| Marca               | `primary`, `secondary`, `accent` (laranja, chamadas à acção), `highlight` (verde) — todos com `-foreground`                                                             |
| Superfície navy     | `inverse`, `inverse-foreground`, `inverse-muted`                                                                                                                        |
| Feedback            | `success`, `warning`, `danger`, `info` (+ `-foreground`)                                                                                                                |
| Foco                | `ring`; `--ds-ring-width`, `--ds-ring-offset`                                                                                                                           |
| Tipografia          | `font-sans`, `font-mono`; `text-display`, `text-heading`, `text-title`, `text-lead`, `text-body`, `text-caption`, `text-micro`; `tracking-brand`, `tracking-brand-wide` |
| Espaçamento         | `px-gutter`, `py-section`, `--spacing-anchor`, `max-w-content` (76rem), `max-w-prose` (42rem)                                                                           |
| Raios               | `rounded-sm` · `md` · `lg` · `xl` · `full`                                                                                                                              |

## Como evoluir

- **Quando a identidade for aprovada:** alterar apenas os valores `--ds-*` (claro e escuro), a fonte em `layout.tsx`, a marca nominativa e o `icon.svg`. Os componentes não mudam.
- **Novo token de cor:** declará-lo nos três blocos (claro, escuro do sistema e escuro forçado) e no `@theme inline`. O teste `src/styles/tokens.test.ts` verifica a paridade e o contraste AA.
