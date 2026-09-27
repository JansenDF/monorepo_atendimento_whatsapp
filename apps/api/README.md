# API

Aplicação NestJS. É responsável por interfaces externas, autorização e composição dos casos de uso; regras de domínio devem ficar em `packages/core` quando puderem ser compartilhadas sem acoplamento a framework.

## Desenvolvimento local

1. Use Node.js 24, copie `.env.example` para `.env` e ajuste `DATABASE_URL`.
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

## Limites desta etapa

O módulo de login, emissão de JWT e refresh token ainda não está implementado. As rotas de tickets validam JWTs emitidos pelo contrato acima e falham fechadas se `JWT_ACCESS_SECRET` não estiver configurado.
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
