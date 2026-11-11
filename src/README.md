# Estrutura de `src/`

| Pasta         | Responsabilidade                                     | Estado W1   |
| ------------- | ---------------------------------------------------- | ----------- |
| `app/`        | Rotas (App Router), layouts, metadados               | Placeholder |
| `components/` | Componentes de apresentação reutilizáveis            | A criar W2  |
| `domain/`     | Tipos e regras de negócio puras (sem I/O)            | A criar W3  |
| `services/`   | Casos de uso que orquestram domínio e repositórios   | A criar W3  |
| `lib/`        | Integrações e utilitários (`lib/supabase` reservado) | Reservado   |
| `i18n/`       | Configuração de idiomas                              | Preparado   |
| `config/`     | Configuração aprovada (ex.: contactos públicos)      | A criar W2  |

Pastas vazias não são criadas para evitar ficheiros sem conteúdo; esta tabela define onde cada camada deve viver.
