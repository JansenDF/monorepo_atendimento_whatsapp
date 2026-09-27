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

## Limites desta etapa

Esta etapa cria bootstrap, validação de ambiente, módulo Prisma e schema/migration dos domínios. Login/refresh, RBAC aplicado aos requests, CRUD, DTOs e repositórios de negócio entram nas fases Auth, Multi-tenant e Tickets.
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
