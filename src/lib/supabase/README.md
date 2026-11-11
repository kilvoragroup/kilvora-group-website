# Supabase (não integrado)

Reservado para W3. Nesta etapa não existe cliente, SDK instalado, ligação, SQL nem migrações.

Regras para quando for autorizado:

- Cliente de navegador usa apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` só no servidor; nunca em código de cliente.
- RLS com negação por omissão em todas as tabelas expostas.
- SQL/migrações só com autorização explícita e plano de rollback.
