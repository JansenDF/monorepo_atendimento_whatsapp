# API

Aplicação NestJS. É responsável por interfaces externas, autorização e composição dos casos de uso; regras de domínio devem ficar em `packages/core` quando puderem ser compartilhadas sem acoplamento a framework.

## Desenvolvimento local

1. Use Node.js 24, copie `.env.example` para `.env`, ajuste `DATABASE_URL` e inicie PostgreSQL e Redis localmente.
2. Execute `corepack pnpm install` na raiz.
3. Execute `corepack pnpm --filter @whatsapp/api db:migrate:dev` para criar/aplicar migrations em um banco local.
4. Execute `corepack pnpm --filter @whatsapp/api dev`.

Prisma ORM 7 usa driver adapter PostgreSQL e gera o client em `src/generated/prisma`. Não edite arquivos gerados.

O catálogo de permissões é global; papéis e associações permanecem vinculados à empresa. `credentialsCiphertext` é reservado para credenciais cifradas pela camada de integração futura. Nunca grave credenciais em `configuration` nem payloads de webhook sem definir retenção e proteção de dados.

Mensagens guardam metadados de anexos e chaves de objeto; arquivos binários ficam em armazenamento privado de objetos. `outbox_events` é a base para publicar eventos depois do commit da transação; payloads devem conter referências e dados mínimos, sem cópia de conteúdo de conversa.

## Tickets

O módulo expõe `GET /tickets`, `GET /tickets/:ticketId`, `PATCH /tickets/:ticketId/status`, `POST /tickets/:ticketId/close`, `POST /tickets/:ticketId/reopen`, `POST /tickets/:ticketId/assume`, `POST /tickets/:ticketId/transfer` e `GET /tickets/metrics`. Listagem aceita filtros `status`, `assigneeId`, `departmentId`, `page` e `pageSize`. Métricas aceitam `from` e `to` ISO-8601; o padrão é os últimos 30 dias e o intervalo máximo é 366 dias.

Rotas de tickets exigem `Authorization: Bearer <JWT>` assinado com HS256 usando `JWT_ACCESS_SECRET`. O token precisa conter `sub` (UUID do usuário), `companyId` (UUID da empresa) e `exp` (epoch em segundos). A cada request, a API confirma usuário ativo, associação à empresa e papéis no PostgreSQL; perfil e empresa nunca são confiados ao corpo da requisição. Configure um segredo aleatório de pelo menos 32 bytes. Login e emissão/refresh de tokens são responsabilidade do módulo Auth, ainda pendente.

ADMIN e SUPERVISOR podem consultar todos os tickets da própria empresa, ver métricas e transferir tickets. AGENT só consulta tickets atribuídos a si ou disponíveis em suas filas/departamentos, pode assumir tickets elegíveis e atuar nos tickets que pode acessar. Mutações concorrentes usam atualização condicional e registram eventos transacionais em `outbox_events`.

O webhook WhatsApp abre um ticket quando não há conversa ativa para o contato, serializa a criação por empresa/contato para evitar tickets duplicados e registra `ticket.created` no outbox. Uma resposta do cliente reabre tickets `PENDING` ou `WAITING_CUSTOMER`. O histórico e relacionamentos já estão no schema inicial, por isso esta entrega não exige migration nova.

`averageFirstResponseSeconds` mede a média entre a primeira mensagem recebida e a primeira mensagem enviada com sucesso para cada ticket no período. `averageHandlingSeconds` mede do `created_at` ao `closed_at` dos tickets fechados criados no período. As contagens por agente/departamento agrupam tickets criados no período pela atribuição/departamento atual; filas sem atribuição aparecem como `null`.

## Atendimento por IA

A classificação de mensagens do WhatsApp é desativada por padrão. Para habilitar OpenAI, configure `AI_ENABLED=true`, `AI_PROVIDER=OPENAI`, `OPENAI_API_KEY` e `OPENAI_MODEL`. Para Azure OpenAI, use `AI_PROVIDER=AZURE_OPENAI`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` e `AZURE_OPENAI_DEPLOYMENT`; o endpoint deve ser HTTPS e pode ser a URL do recurso ou já terminar em `/openai/v1`.

Cadastre as respostas autorizadas pela empresa em `/ai/faqs` usando JWT de perfil `ADMIN` ou `SUPERVISOR`. A API oferece `GET`, `POST`, `GET /:faqId`, `PATCH /:faqId` e `DELETE /:faqId`; remoção desativa o registro. As FAQs e execuções são isoladas por `company_id`.

Mensagens de texto recebidas são classificadas. Só há resposta automática para intenção `FAQ`, score estritamente maior que 85 e resposta que corresponda a uma resposta cadastrada pela empresa; os demais casos, solicitações de humano, falhas do provedor e mensagens sem resposta confiável permanecem na fila humana. Mídia é persistida pelo fluxo WhatsApp existente e encaminhada sem classificação multimodal.

`ai_executions` persiste o prompt enviado, resposta estruturada do provedor, intenção, score percentual, resposta autorizada, provedor/modelo e resultado do fluxo. A chave única por empresa e mensagem, o estado de claim e a relação idempotente com a mensagem de saída impedem respostas repetidas em reentregas do webhook. Apply a migration with `corepack pnpm --filter @whatsapp/api db:migrate:deploy`.

## Limites desta etapa

O módulo de login, emissão de JWT e refresh token ainda não está implementado. As rotas de tickets validam JWTs emitidos pelo contrato acima e falham fechadas se `JWT_ACCESS_SECRET` não estiver configurado.

## Qualidade

`corepack pnpm --filter @whatsapp/api lint`, `typecheck`, `test` e `test:cov` verificam lint, TypeScript e Jest; `db:validate` valida o schema Prisma. `corepack pnpm check` executa a pipeline local completa, incluindo frontend, build e smoke tests de navegador. Consulte `docs/development/quality-and-feature-workflow.md` para migrations, integração contínua e limites de cobertura. O gate de coverage da API evita queda abaixo do baseline atual; a meta de 80% ainda não foi alcançada.
# WhatsApp Cloud API

The API exposes `GET /whatsapp/webhook` for Meta's subscription handshake and
`POST /whatsapp/webhook` for inbound messages and message status events. POST
requests are verified against the raw request bytes using `X-Hub-Signature-256`.
The bootstrap enables Nest's raw-body capture; do not disable it or add middleware
that rewrites the request body before signature validation.

Configure `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_APP_SECRET`, and a 32-byte `WHATSAPP_CREDENTIALS_ENCRYPTION_KEY`.
The Graph API version is deliberately selected in deployment configuration so
operators can move to a currently supported Meta version without a code change.
For inbound media, configure a private S3-compatible bucket using the
`WHATSAPP_MEDIA_S3_*` variables. Media downloads are size limited, content type
and SHA-256 checked, and uploaded with server-side encryption.

Each WhatsApp phone number is represented by an active `Integration` row with
`provider = WHATSAPP_CLOUD_API` and `externalAccountId` set to its Meta
`phone_number_id`. `credentialsCiphertext` must contain the AES-256-GCM envelope
produced by `WhatsappCredentialsCipher.encrypt({ accessToken })`, and
`credentialsKeyVersion` must be `v1`. Access tokens are never stored in the JSON
configuration or logged. The internal `configureIntegration()` method encrypts
and saves a phone number connection; the caller must supply a company id from
trusted server-side identity. A public integration-management endpoint depends
on the authentication/RBAC phase and is intentionally not exposed as a public
route here.

Outbound service calls are scoped by company, integration, and ticket; the
recipient is resolved from the ticket's WhatsApp contact. They first persist a
`QUEUED` message and then update it to `SENT` or `FAILED`. Meta delivery/read
webhooks update the persisted status without allowing older statuses to
overwrite newer ones. The webhook stores a durable inbox event and acknowledges
the request before media downloads and conversation processing run in the
background. Inbound provider messages and event records are idempotent; failed
inbox events retry with exponential backoff, capped at ten attempts. Cloud API
HTTP 429, 5xx, and explicitly transient Graph errors use
bounded exponential retries with `Retry-After` support. Network timeouts are
not retried because Meta may have accepted a message before the connection was
lost; the message stays `QUEUED` with an `OUTCOME_UNKNOWN` marker so a later
status webhook can reconcile it without creating a duplicate send.

Apply the additive migration with `pnpm --filter @whatsapp/api db:migrate:deploy`.

## Socket.IO em tempo real

O `ChatGateway` autentica o handshake com o mesmo JWT HS256 usado pelas rotas REST
(`auth.token` ou `Authorization: Bearer ...`) e recarrega usuário, empresa, papéis
e departamentos no PostgreSQL. A conexão entra somente na sala da própria empresa.
`ticket:join` valida o acesso ao ticket antes de entrar na sala da conversa;
`ticket:leave` remove a inscrição. `ticket.created`, `message.received`,
`message.sent`, `message.status_changed`, `ticket.closed` e `ticket.status_changed`
levam apenas os IDs do ticket e, quando aplicável, da mensagem na sala autorizada
do ticket. A sala da empresa recebe `tickets.changed` para atualizar listas; na
criação, recebe `ticket.created`. O corpo e o histórico são obtidos pelas rotas
REST, que continuam aplicando o isolamento por empresa e as permissões.

Os eventos são gravados em `outbox_events` junto com a transação de criação da
mensagem ou alteração do ticket. Cada instância reivindica lotes com
`FOR UPDATE SKIP LOCKED`, publica através do Redis Adapter e aplica retry com
backoff; eventos sem suporte são marcados como publicados sem broadcast. Isso
permite que várias instâncias da API compartilhem salas e entrega de eventos.
Configure `REDIS_URL` em todos os ambientes. O processo falha no startup se não
conseguir conectar ao Redis. Configure `FRONTEND_ORIGINS` como uma lista de
origens separadas por vírgula para Socket.IO.

O navegador reconecta indefinidamente com backoff e revalida as queries ao
conectar novamente. O polling das queries de tickets continua ativo para
reconciliação quando o navegador esteve desconectado. Em deployments com
balanceamento que mantenham o long-polling do Socket.IO habilitado, configure
afinidade de sessão no load balancer; o Redis Adapter distribui broadcasts,
mas não substitui essa afinidade. Também permita conexões WebSocket e o tráfego
entre as instâncias e o Redis.
