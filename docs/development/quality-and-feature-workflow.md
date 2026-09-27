# Qualidade e fluxo para novas features

Este guia define as verificações locais e os critérios de integração contínua para alterações no monorepo. `corepack pnpm check` é o comando completo usado antes de abrir ou atualizar um pull request.

## Pré-requisitos

- Node.js 24; rode `corepack enable` uma vez para criar os comandos pnpm usados pelo Turborepo. O repositório fixa pnpm 12.7.0 via Corepack.
- Dependências instaladas com `corepack pnpm install`.
- Para os comandos da API e a validação Prisma, configure `DATABASE_URL` em `apps/api/.env` conforme `apps/api/.env.example`. `prisma validate` não aplica migrations nem precisa de conexão ativa; `db:migrate:deploy` precisa de PostgreSQL.
- Para testes e2e locais, instale o Chromium uma vez: `corepack pnpm exec playwright install chromium`. O Playwright inicia o build em `127.0.0.1:4317`; ajuste com `PLAYWRIGHT_PORT` se essa porta estiver ocupada.

## Comando completo

```sh
corepack pnpm check
```

O comando roda em sequência:

1. `pnpm lint` — ESLint flat config compartilhado para API e frontend, com regras TypeScript e Next.js Core Web Vitals.
2. `pnpm typecheck` — `tsc --noEmit` para API e frontend, incluindo os testes TypeScript; a API gera o Prisma Client antes da checagem.
3. `pnpm --filter @whatsapp/api db:validate` — valida `schema.prisma` sem aplicar alterações no banco.
4. `pnpm test` — Jest/coverage na API e Jest na validação de schemas do frontend.
5. `pnpm build` — compilação NestJS e build de produção Next.js.
6. `pnpm test:e2e` — Playwright abre o build de produção do frontend e verifica validação do formulário de login e alternância da visibilidade da senha.

O GitHub Actions executa `pnpm check` em pull requests e pushes para `main`. Antes disso, instala as dependências com lockfile imutável, aplica todas as migrations em um PostgreSQL vazio e instala Chromium. Assim, mudanças no schema que não são aplicáveis também bloqueiam a integração.

## Comandos por projeto

```sh
corepack pnpm --filter @whatsapp/api lint
corepack pnpm --filter @whatsapp/api typecheck
corepack pnpm --filter @whatsapp/api test
corepack pnpm --filter @whatsapp/api test:cov
corepack pnpm --filter @whatsapp/api db:validate
corepack pnpm --filter @whatsapp/api db:migrate:status

corepack pnpm --filter @whatsapp/frontend lint
corepack pnpm --filter @whatsapp/frontend typecheck
corepack pnpm --filter @whatsapp/frontend test
corepack pnpm --filter @whatsapp/frontend test:e2e
```

`db:migrate:status` e `db:migrate:deploy` precisam de uma instância PostgreSQL. Nunca execute `db:migrate:deploy` contra produção a partir de uma sessão de desenvolvimento; produção deve usar o processo de release aprovado.

## Padrão para uma feature

1. Leia o `AGENTS.md` mais próximo, o README do domínio e o contrato público afetado. Confirme se a feature já existe e identifique dependências entre `apps/` e `packages/`.
2. Mantenha controllers/adaptadores na borda. Valide DTOs e schemas no transporte; coloque políticas/regras de domínio em serviços/casos de uso e persistência atrás dos repositórios.
3. Para qualquer dado de empresa, derive o tenant da identidade validada no servidor, aplique `companyId` nas consultas e valide os relacionamentos no mesmo tenant. Não aceite IDs do corpo como autorização.
4. Para mudanças Prisma, edite `schema.prisma`, crie migration aditiva com `db:migrate:dev`, revise o SQL gerado e verifique `db:validate` e `db:migrate:deploy` em banco descartável. Nunca edite migrations já aplicadas.
5. Adicione testes que cubram o comportamento feliz e os limites relevantes: validação inválida, autorização/tenant, concorrência ou idempotência e falhas externas quando aplicável.
6. Atualize documentação de endpoint/configuração e contratos compartilhados quando a mudança afetar consumidores.
7. Rode `corepack pnpm check`; registre qualquer etapa que dependa de credenciais, serviços ou ambiente indisponível.

### API

- Coloque testes unitários Jest em `apps/api/test/<domínio>/*.spec.ts`.
- Mock repositories em testes de serviço; teste repositórios, filtros tenant-scoped e integração com PostgreSQL quando a garantia depender de SQL/constraints.
- Use `class-validator`/`class-transformer` nos DTOs e mantenha o `ValidationPipe` global restritivo. Autenticação não substitui autorização, RBAC nem checagem de tenant.
- Use transação e outbox para mudanças de estado que publicam eventos. Webhooks e jobs precisam tratar retry e idempotência.

### Frontend

- Escreva testes unitários junto aos módulos em `src/` com sufixo `.spec.ts` ou `.spec.tsx`.
- Teste schemas Zod para valores válidos e inválidos e teste interações importantes de formulários/componentes.
- Use Playwright em `apps/frontend/e2e/` para fluxos que precisam rodar no navegador real. O projeto atual mantém um smoke test de login independente dos endpoints ainda pendentes da API.

## Limites atuais de cobertura

O baseline Jest da API medido antes destes gates era 45,27% de statements, 37,48% de branches, 43,30% de functions e 46,62% de lines. O Jest mantém um piso próximo desse baseline para impedir regressão, mas a meta de 80% declarada para o produto **ainda não foi atingida** e não deve ser apresentada como cobertura atual. Os schemas do frontend têm gate próprio de 80%; aumente o piso global da API conforme os testes forem ampliados.

Os testes da API existentes são unitários e usam mocks em pontos de integração. A pipeline aplica migrations em PostgreSQL vazio e testa o login no navegador, mas ainda não substitui uma suíte ampla de integração da API com PostgreSQL/Redis e provedores externos.
