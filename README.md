# WhatsApp Atendimento

Monorepo da plataforma SaaS de atendimento omnichannel, automações e agentes de IA.

## Requisitos locais

- Node.js 22 (faixa aceita pelo repositório: `>=22.14.0 <25`)
- Corepack habilitado para ativar a versão de pnpm definida em `package.json`
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
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Cada aplicação ou pacote implementável declara seus próprios scripts. Os diretórios marcados como “a iniciar” registram os limites da arquitetura; eles passam a participar das tarefas do Turborepo quando seus projetos executáveis forem adicionados nas fases correspondentes.

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
