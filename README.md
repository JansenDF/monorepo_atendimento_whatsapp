# WhatsApp Atendimento

Monorepo da plataforma SaaS de atendimento omnichannel, automações e agentes de IA.

## Requisitos locais

- Node.js 24 (faixa aceita pelo repositório: `>=24.0.0 <25`)
- Corepack para ativar a versão de pnpm definida em `package.json`
- Docker será necessário quando os serviços locais forem introduzidos na fase de infraestrutura

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `apps/frontend` | Aplicação web Next.js |
| `apps/api` | API NestJS e casos de uso da plataforma |
| `apps/worker` | Consumidores assíncronos de filas e tarefas em background |
| `apps/n8n` | Workflows exportados e documentação de integração com n8n |
| `packages/ui` | Componentes visuais compartilhados |
| `packages/types` | Contratos e schemas compartilhados entre processos |
| `packages/core` | Modelo de domínio e regras independentes de framework |
| `packages/sdk` | Cliente tipado para consumo da API |
| `packages/eslint-config` | Configuração lint compartilhada |
| `packages/typescript-config` | Bases TypeScript compartilhadas |
| `infra` | Docker, proxy reverso e infraestrutura como código |
| `docs/architecture` | Decisões e limites arquiteturais |

## Comandos do workspace

Os comandos de raiz delegam tarefas aos pacotes pelo Turborepo:

```sh
corepack enable
corepack pnpm install
corepack pnpm dev
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm check
```

`check` roda lint, TypeScript, validação do schema Prisma, testes unitários, build e smoke tests de navegador. A API usa Jest; o frontend usa Jest e Playwright. Instale Chromium para rodar os e2e localmente com `corepack pnpm exec playwright install chromium`.

Cada aplicação ou pacote implementável declara seus próprios scripts e é incluído nas tarefas do Turborepo. Os diretórios marcados como “a iniciar” não participam até receberem manifestos e scripts executáveis. A pipeline em `.github/workflows/ci.yml` repete `pnpm check`, aplica migrations em PostgreSQL descartável e mantém artefatos de diagnóstico do Playwright em falhas.

Consulte o [guia de qualidade e fluxo de features](docs/development/quality-and-feature-workflow.md) antes de implementar uma alteração. A cobertura atual da API ainda não atinge a meta histórica de 80%; o guia registra o baseline medido e o gate de regressão.

## Fases

1. Arquitetura do monorepo
2. Banco de dados e Prisma
3. Autenticação
4. Isolamento multi-tenant
5. Tickets
6. WhatsApp
7. Frontend
8. IA
9. n8n

Consulte [a arquitetura do monorepo](docs/architecture/monorepo.md) para as regras de dependência e evolução.
