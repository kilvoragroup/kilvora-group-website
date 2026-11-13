# Supabase (em preparação — W3)

W3-B1: dependências instaladas (`@supabase/supabase-js`, `@supabase/ssr`) e configuração local endurecida em `supabase/config.toml`. Ainda não existe cliente, ligação, SQL nem migrações.

Regras:

- O cliente (navegador e servidor) usa apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, com a sessão do utilizador.
- A V1 não usa chave privilegiada (secret/service_role). A autorização assenta em RLS e funções da base de dados; introduzir uma chave destas exige decisão expressa, uso exclusivo no servidor e nunca o prefixo `NEXT_PUBLIC_`.
- RLS com negação por omissão em todas as tabelas expostas; `auto_expose_new_tables = false` obriga a `GRANT` explícito.
- Papéis lidos apenas de tabela própria, nunca de `user_metadata`.
- SQL/migrações só com autorização explícita e plano de rollback.
