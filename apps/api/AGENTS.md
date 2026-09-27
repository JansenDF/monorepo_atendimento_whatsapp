# Instruções da API

Estas regras complementam o `AGENTS.md` da raiz e se aplicam a `apps/api/`.

## Responsabilidades e organização

- A API NestJS expõe interfaces HTTP e Socket.IO, aplica autenticação/autorização e coordena casos de uso. Regras puras e compartilháveis pertencem a `packages/core`.
- Organize cada domínio em módulo próprio. Mantenha controllers responsáveis por protocolo HTTP e validação de fronteira; services/casos de uso coordenam operações; regras de negócio devem ser explícitas e testáveis.
- Use ports e repositories para isolar persistência e integrações quando isso mantiver dependências apontadas para dentro. Evite acessar Prisma diretamente em controllers e evite abstrações sem uso concreto.
- Registre providers e dependências no módulo responsável. Não crie dependências circulares entre módulos.
- DTOs validam entrada e definem a forma do transporte; não substituem entidades, políticas de domínio ou autorização.

## NestJS e validação

- Siga os padrões NestJS já configurados e mantenha validação na borda com `class-validator`/`class-transformer` e pipes apropriados.
- Use guards e políticas de autorização para proteger rotas. Não trate autenticação como autorização: valide perfil/permissão e tenant para cada operação protegida.
- Use o filtro global existente para respostas de erro consistentes. Não capture exceções para ignorá-las ou retornar sucesso artificial.
- Respostas e erros não devem incluir stack trace, tokens, segredos ou dados de outra empresa.

## Prisma e PostgreSQL

- O projeto usa Prisma ORM 7, driver adapter PostgreSQL e configuração em `prisma7.config.ts`. Consulte o `package.json` e `README.md` da API para comandos vigentes.
- O schema fonte é `prisma/schema.prisma`. O client em `src/generated/prisma` é gerado e nunca deve ser editado manualmente.
- Preserve nomes idiomáticos no TypeScript e mapeamentos explícitos para colunas/tabelas SQL quando definidos no schema.
- Em toda consulta ou mutação tenant-scoped, aplique `companyId` do contexto autenticado confiável. Valide que entidades relacionadas pertencem à mesma empresa.
- Prefira chaves estrangeiras compostas e índices que reflitam as fronteiras e consultas por empresa. Use transações para mudanças que precisam ser atômicas.
- Migrations devem ser revisadas, aditivas e compatíveis com a estratégia de deploy. Nunca reescreva uma migration aplicada; não aplique migration em produção como parte de uma alteração de código.

## WhatsApp e integrações

- Consulte a seção WhatsApp Cloud API em `README.md` antes de alterar webhooks ou envio.
- A validação de assinatura depende dos bytes originais (`rawBody`) e do cabeçalho `X-Hub-Signature-256`; preserve a captura no bootstrap e não transforme o corpo antes da verificação.
- Webhooks e processamento assíncrono devem ser idempotentes, persistir os eventos necessários e tratar retries sem duplicar efeitos. Não repita envios quando o provedor puder ter aceitado a mensagem e o resultado de rede for ambíguo.
- Tokens de acesso devem permanecer cifrados em repouso e nunca aparecer em logs. Mídia deve usar armazenamento privado, limites de tamanho e validação de conteúdo conforme a implementação existente.
- Erros de provedores precisam ser classificados; aplique retries limitados apenas a falhas transitórias e preserve contexto suficiente para observabilidade sem registrar conteúdo sensível.

## Testes e verificações

- Coloque testes Jest próximos às convenções de `test/` e use `@nestjs/testing` quando fizer sentido.
- Teste regras e cenários de tenant, autorização, idempotência, falhas e estados relevantes; mocks não substituem testes de integração quando a garantia depende do PostgreSQL ou do contrato externo.
- A API possui tarefas `lint`, `typecheck`, `test`, `test:cov` e `db:validate` em `apps/api/package.json`. A qualidade completa do workspace é `corepack pnpm check`; veja `docs/development/quality-and-feature-workflow.md` para exemplos e limites da cobertura.
- Ao relatar a entrega, separe verificações executadas das não executadas e registre limitações como migration não aplicada a um banco local.
