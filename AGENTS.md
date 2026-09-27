# Instruções do repositório

Estas instruções se aplicam a todo o monorepo. Instruções mais específicas em subdiretórios complementam este arquivo.

## Contexto do produto

Este repositório implementa uma plataforma SaaS omnichannel de atendimento, com WhatsApp, atendimento humano, automações e IA. Trabalhe no escopo pedido e evolua o produto por fases, conforme a seção **Fases** do `README.md`. Ao concluir uma fase solicitada, apresente o resultado e pare; não avance para a fase seguinte sem solicitação.

Antes de alterar código, explique brevemente o problema, a solução proposta, os limites arquiteturais e os impactos esperados. Inspecione o estado atual do código e a documentação relacionada antes de assumir que uma funcionalidade já existe.

## Estrutura e limites arquiteturais

- O workspace usa pnpm e Turborepo. Consulte `pnpm-workspace.yaml`, `turbo.json` e os scripts reais dos pacotes antes de executar comandos.
- Aplicações executáveis vivem em `apps/`; código compartilhado vive em `packages/`.
- Siga `docs/architecture/monorepo.md`: dependências apontam de `apps` para `packages`; pacotes compartilhados não importam aplicações; evite ciclos entre pacotes.
- `packages/core` deve manter regras de domínio independentes de frameworks e infraestrutura. `packages/types` contém contratos, não regras de negócio. `packages/sdk` expõe o cliente tipado da API.
- Integrações externas, filas, banco e transporte ficam atrás de limites explícitos. Não replique regras de negócio em controllers, workers ou workflows do n8n.
- Prefira SOLID, DDD e Clean Architecture sem criar camadas ou abstrações sem responsabilidade concreta. Use CQRS quando os fluxos de leitura e escrita realmente pedirem modelos ou escalabilidade diferentes.
- Preserve compatibilidade dos contratos públicos ou documente claramente mudanças incompatíveis.

## Segurança e dados

- Toda operação sobre dados de empresa precisa de um `companyId` obtido de identidade/contexto confiável no servidor. Nunca confie em `companyId` recebido diretamente do corpo, query string ou cabeçalho controlado pelo cliente.
- Aplique o escopo do tenant em leituras, alterações, remoções e validações de relacionamentos. IDs globalmente únicos não substituem o filtro por empresa.
- Mantenha integridade entre empresas no PostgreSQL com chaves estrangeiras compostas quando aplicável; isso complementa a autorização e os filtros da aplicação, não os substitui.
- Não exponha dados de outra empresa em respostas, erros, logs, métricas ou eventos.
- Segredos e tokens devem vir de variáveis de ambiente ou secret stores. Nunca os grave no Git, em workflows exportados, em logs ou em campos de configuração sem proteção apropriada.
- Minimize dados pessoais em logs e eventos. Defina proteção e retenção antes de persistir payloads sensíveis de integrações.

## Qualidade e processo

- Valide entradas nas fronteiras da aplicação e mantenha regras de domínio fora de DTOs e controllers.
- Adicione testes automatizados para comportamento novo ou alterado, de acordo com o escopo e as ferramentas existentes. Não declare validações como executadas se não foram executadas; informe comandos, resultados e limitações relevantes.
- Prefira logs estruturados, erros observáveis e operações idempotentes para processamento assíncrono e webhooks.
- Não edite código gerado, dependências instaladas ou arquivos de build. Não adicione dependências sem necessidade e compatibilidade verificadas.
- Mantenha migrations versionadas e aditivas. Não altere migrations já aplicadas em ambientes compartilhados; crie uma nova migration para correções de schema.
- Preserve alterações preexistentes do usuário. Antes de finalizar, confira `git status` e descreva os arquivos alterados. Só faça stage, commit, push ou operações externas quando isso for solicitado.
- Não expanda uma tarefa para implementar módulos ou fases adjacentes sem autorização explícita.

## Comandos

Os comandos de raiz definidos atualmente incluem `corepack pnpm dev`, `build`, `lint`, `typecheck`, `test` e `test:e2e`. Cada pacote pode oferecer apenas parte deles; confirme os scripts disponíveis no `package.json` do pacote antes de executar. A API usa Node.js 24 e Prisma ORM 7; veja `apps/api/README.md` para configuração e comandos de banco.
