# KILVORA GROUP — Website institucional

@AGENTS.md

Fonte de verdade: `Docs/KILVORA_GROUP_Plano_Director_Website_Institucional_v1.0.md` (local, não versionado).
Este repositório é exclusivo do website institucional. Não confundir com Kilvora Core/HCM.

## Stack

- Next.js (App Router) + React + TypeScript `strict`
- Tailwind CSS v4, ESLint (eslint-config-next), Prettier
- Vitest (unitários, `src/**/*.test.ts(x)`); Playwright reservado em `e2e/` (não instalado)
- Supabase reservado em `src/lib/supabase/` (não integrado)
- i18n: `src/i18n/config.ts` — activos pt-BR e pt-AO; en/es preparados e desactivados
- Design system: tokens em `src/styles/tokens.css` (identidade provisória); decisões em `documentacao/engenharia/design-system.md`
- Configuração: `src/config/` (`site.ts`, `navigation.ts` — fonte única do menu/rodapé/sitemap, `contacts.ts` — fonte única de contactos)
- Conteúdo: `src/content/` — tipado, com `status: aprovado | provisorio` e variantes pt-AO/pt-BR (`v(ao, br)`); provisório é sempre assinalado «Em validação»
- Componentes: `src/components/`; modelos de página em `src/app/**/_components/`
- Next 16 com `cacheComponents`: não usar `dynamicParams`; menus fecham ao ocultar a rota (Activity). Se o CSS parecer desactualizado, apagar `.next` e reconstruir
- CI: `.github/workflows/ci.yml` (`npm ci` + `npm run verify`, Node 24, `contents: read`, telemetria desactivada)

Documentação de engenharia versionada vai em `documentacao/` — nunca em `docs/` (no Windows coincide com `Docs/`, que é protegida e ignorada).

Utilizar `npm.cmd` / `npx.cmd` no PowerShell.

## Comandos

| Objectivo  | Comando                    |
| ---------- | -------------------------- |
| Dev        | `npm.cmd run dev`          |
| Tipos      | `npm.cmd run typecheck`    |
| Lint       | `npm.cmd run lint`         |
| Formatação | `npm.cmd run format:check` |
| Testes     | `npm.cmd test`             |
| Build      | `npm.cmd run build`        |
| Tudo       | `npm.cmd run verify`       |

## Arquitectura

- Estilos só com utilitários semânticos dos tokens (`bg-primary`, `text-muted-foreground`, `rounded-md`); nunca valores literais (`#hex`, `zinc-600`, `[13px]`) nos componentes.
- Separar apresentação (`src/app`, `src/components`), domínio (`src/domain`), serviços (`src/services`), repositórios e integrações (`src/lib`).
- Validação partilhada com Zod (a introduzir quando houver formulários).
- Contactos públicos centralizados num único ficheiro de configuração aprovado; nunca publicar contactos não confirmados.
- Nunca mostrar um idioma sem traduções suficientes.
- Nenhuma confirmação fictícia: só indicar sucesso após persistência/entrega real.
- HTML semântico, acessibilidade (contraste, teclado, formulários rotulados), SEO técnico.

## Segurança

- Segredos apenas em `.env.local` (ignorado). `.env.example` nunca contém valores reais.
- `SUPABASE_SERVICE_ROLE_KEY` e outras credenciais administrativas apenas no servidor; nunca com prefixo `NEXT_PUBLIC_`.
- RLS com negação por omissão em todas as tabelas expostas (quando W3 for autorizado).

## Limites de execução (obrigatórios)

- `Docs/` é só de leitura: nunca alterar, mover, eliminar nem versionar.
- Não fazer commit, push nem deploy sem autorização explícita.
- Não modificar Supabase nem Vercel; não executar SQL nem migrações sem autorização explícita e plano de rollback.
- Não activar API oficial de WhatsApp, agentes IA ou serviços pagos.
- Trabalhar por portões W1–W5 do Plano Director; parar no fim de cada etapa e aguardar aprovação.
- Em caso de conflito com ficheiros existentes, parar antes de sobrescrever.

## Estado dos portões

- W1 — Fundação: concluído e publicado (`main`, protegida por ruleset; alterações só por branch + PR).
- W2-A — Análise de identidade e conteúdos: concluída.
- W2-B — Interface institucional: implementada localmente na branch `feat/w2-b-institutional-ui` (sem commit). Aguarda auditoria.
- W3–W5: não iniciados. Rotas `/cliente/*` reservadas para W3.
