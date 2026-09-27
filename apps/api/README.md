# API

Aplicação NestJS. É responsável por interfaces externas, autorização e composição dos casos de uso; regras de domínio devem ficar em `packages/core` quando puderem ser compartilhadas sem acoplamento a framework.

## Desenvolvimento local

1. Use Node.js 24, copie `.env.example` para `.env` e ajuste `DATABASE_URL`.
2. Execute `corepack pnpm install` na raiz.
3. Execute `corepack pnpm --filter @whatsapp/api db:migrate:dev` para criar/aplicar migrations em um banco local.
4. Execute `corepack pnpm --filter @whatsapp/api dev`.

Prisma ORM 7 usa driver adapter PostgreSQL e gera o client em `src/generated/prisma`. Não edite arquivos gerados.

O catálogo de permissões é global; papéis e associações permanecem vinculados à empresa. `credentialsCiphertext` é reservado para credenciais cifradas pela camada de integração futura. Nunca grave credenciais em `configuration` nem payloads de webhook sem definir retenção e proteção de dados.

Mensagens guardam metadados de anexos e chaves de objeto, não os arquivos binários. `outbox_events` é a base para publicar eventos depois do commit da transação; payloads devem conter referências e dados mínimos, sem cópia de conteúdo de conversa.

## Limites desta etapa

Esta etapa cria bootstrap, validação de ambiente, módulo Prisma e schema/migration dos domínios. Login/refresh, RBAC aplicado aos requests, CRUD, DTOs e repositórios de negócio entram nas fases Auth, Multi-tenant e Tickets.
