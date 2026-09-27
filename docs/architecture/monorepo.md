# Arquitetura do monorepo

## Objetivo

Manter aplicações que têm ciclos de execução diferentes no mesmo repositório, com dependências e contratos explícitos. pnpm Workspaces resolve os pacotes locais; Turborepo agenda tarefas conforme o grafo de dependências e mantém cache dos artefatos declarados.

## Limites

### Aplicações (`apps/`)

- `frontend`: interface web e composição de fluxos de usuário.
- `api`: entrada HTTP e Socket.IO, autenticação futura, autorização e composição dos casos de uso.
- `worker`: processamento assíncrono de filas, tarefas de integração e consumidores de eventos.
- `n8n`: workflows exportáveis versionados; não é um pacote Node nem substitui regras de domínio da API.

Aplicações podem depender de pacotes compartilhados. Pacotes compartilhados não podem importar código de uma aplicação.

### Pacotes (`packages/`)

- `core`: entidades, value objects, políticas e casos de uso sem dependência de NestJS, Prisma, Redis ou Next.js.
- `types`: schemas e contratos de transporte compartilhados. Não deve se tornar o lugar das regras de negócio.
- `sdk`: cliente HTTP tipado para consumidores da API; depende dos contratos públicos, não de implementações internas.
- `ui`: componentes React reutilizáveis, sem dependência das aplicações.
- `eslint-config` e `typescript-config`: configurações únicas para reduzir divergência entre projetos.

Direção prevista para dependências: `apps -> packages`; `core` permanece no centro e não conhece adaptadores externos. Banco, filas, WhatsApp, provedores de IA e Socket.IO serão conectados por adaptadores nas aplicações. Ciclos entre pacotes compartilhados são proibidos.

## Comunicação e consistência

A API será responsável por validar comandos, executar casos de uso e persistir mudanças. Eventos de domínio permitem que o worker execute efeitos assíncronos; a estratégia de publicação confiável (outbox transacional) será detalhada junto ao modelo Prisma. Redis/BullMQ atende filas e retries, enquanto Socket.IO entrega atualizações aos clientes conectados. Workflows n8n chamam interfaces versionadas da API e não acessam diretamente tabelas internas.

## Isolamento e segurança

O tenant é contexto obrigatório nas operações de domínio e persistência. A aplicação da fronteira será implementada nas fases de banco e multi-tenant, incluindo regras em repositórios e autorização; a estrutura de pastas por si só não fornece isolamento. Segredos ficam em variáveis de ambiente ou secret stores e nunca em workflows exportados ou no Git.

## Orquestração

`turbo.json` define tarefas comuns. Builds aguardam builds das dependências (`^build`); tarefas de desenvolvimento são persistentes e não entram no cache; testes e2e não usam cache. Cada pacote concreto declara seus scripts e outputs. `pnpm-workspace.yaml` limita o workspace a aplicações e pacotes, evitando tratar `infra/` e `docs/` como projetos Node.

## Evolução

Cada fase adiciona implementação somente ao limite correspondente. Mudanças transversais de dependência ou propriedade de dados devem atualizar este documento. A Fase 1 prepara diretórios, manifests e configurações; não cria endpoints, schema de banco, containers ou fluxos de atendimento.
