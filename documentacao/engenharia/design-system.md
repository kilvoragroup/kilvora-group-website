# Design system — fundação (W1)

**Estado:** provisório. Os valores são neutros de engenharia e **não** representam a identidade visual aprovada da KILVORA GROUP.

## Decisões

1. **Fonte única de tokens:** [`src/styles/tokens.css`](../../src/styles/tokens.css). Nenhum componente usa cores, raios ou tamanhos literais (`#hex`, `zinc-600`, `[13px]`). Só utilitários semânticos.
2. **Duas camadas:**
   - Variáveis `--ds-*` em `:root` contêm os valores e mudam por tema.
   - `@theme inline` expõe-nas ao Tailwind CSS v4 como utilitários (`bg-primary`, `text-muted-foreground`, …). Com `inline`, a troca de tema não exige recompilação.
3. **Temas:** o claro é o padrão; o escuro segue `prefers-color-scheme`. É possível forçar o tema com `data-theme="light|dark"` no `<html>`, já preparado para um selector futuro (não implementado).
4. **Cor em OKLCH:** facilita ajustar a luminosidade de forma previsível e manter o contraste ao trocar de tema.
5. **Foco acessível:** `:focus-visible` global com `--ds-ring`, contorno de 2px e afastamento de 2px.
6. **Movimento reduzido:** `prefers-reduced-motion` respeitado globalmente.
7. **Sem bibliotecas de UI** e sem componentes, marcas ou padrões visuais de terceiros (incluindo SAP).

## Tokens

| Grupo               | Utilitários Tailwind                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Superfícies e texto | `background`, `foreground`, `surface`, `surface-foreground`, `muted`, `muted-foreground`, `border`, `input`                                                        |
| Acção               | `primary`, `primary-foreground`, `secondary`, `secondary-foreground`                                                                                               |
| Feedback            | `success`, `warning`, `danger`, `info` (+ `-foreground`)                                                                                                           |
| Foco                | `ring` (cor); `--ds-ring-width`, `--ds-ring-offset`                                                                                                                |
| Tipografia          | `font-sans`, `font-mono`; `text-display`, `text-heading`, `text-body`, `text-caption`                                                                              |
| Espaçamento         | `p-gutter`/`px-gutter` (margem lateral fluida), `py-section` (ritmo vertical), `max-w-content` (72rem), `max-w-prose` (42rem); a escala base do Tailwind mantém-se |
| Raios               | `rounded-sm` · `md` · `lg` · `xl` · `full`                                                                                                                         |

## Como evoluir

- **Quando a identidade for aprovada:** alterar apenas os valores `--ds-*` (claro e escuro) e a fonte em `layout.tsx`. Os componentes não mudam.
- **Novo token de cor:** declará-lo nos três blocos (claro, escuro do sistema e escuro forçado) e no `@theme inline`. O teste `src/styles/tokens.test.ts` falha se faltar algum.
- **Contraste:** validar AA (4,5:1 para texto, 3:1 para UI e foco) quando a paleta final for definida.

## Pendente de aprovação

Paleta da marca, tipografia oficial (a Geist é provisória), uso do logótipo e ícones.
