# Atende frontend

Painel Next.js responsivo para atendimento omnichannel. A aplicação usa App Router, React, TypeScript, Tailwind CSS 4, componentes no padrão shadcn/ui, TanStack Query, Zustand e Socket.IO Client.

## Desenvolvimento local

1. Copie `.env.example` para `.env.local` na pasta `apps/frontend`.
2. Na raiz do monorepo, execute `corepack pnpm install`.
3. Inicie o painel com `corepack pnpm --filter @whatsapp/frontend dev`.

O painel espera a API em `http://localhost:3001`. `NEXT_PUBLIC_SOCKET_URL` define a origem do Socket.IO. O modo de demonstração é local e sintético: habilite `NEXT_PUBLIC_DEMO_MODE=true` somente no servidor de desenvolvimento para explorar as telas sem API. Ele é deliberadamente desativado em produção.

## Telas

- `/login`: autenticação por e-mail e senha.
- `/dashboard`: contagens por estado, indicadores de atendimento, distribuição por agente/departamento e conversas recentes.
- `/tickets`: fila filtrável, histórico de mensagens, resposta de texto, transferência, atribuição, encerramento e reabertura.
- `/customers`: pesquisa paginada, edição do perfil e histórico de tickets.
- `/settings`: perfil, tema e preferências locais de notificação.

Tokens de acesso são mantidos apenas em memória. A restauração de sessão usa `POST /auth/refresh` com cookie HTTP-only e as requisições incluem credenciais. Para uma integração real, o backend deve emitir o cookie de refresh com `Secure`, `HttpOnly` e política `SameSite` adequada ao domínio.

## Contrato e integração pendente

O painel consome `GET /tickets`, `GET /tickets/:id`, `GET /tickets/metrics`, `POST /tickets/:id/{close,reopen,assume,transfer}` e envia mensagens pelo contrato esperado `POST /tickets/:id/messages`. A API atual implementa consultas, métricas e ações de ticket, mas ainda não oferece rotas de login/refresh/logout, mensagens, clientes, usuários/agentes ou departamentos, nem eventos Socket.IO. As telas mostram estados de erro quando essas rotas não estão disponíveis; o modo de demonstração não substitui a persistência da API.

As métricas do dashboard são consultadas apenas para perfis `ADMIN` e `SUPERVISOR`, conforme o RBAC da API atual. Agentes continuam vendo a fila e a contagem total de tickets por situação. A transferência fica disponível para administradores e supervisores; assumir ticket fica disponível para agentes.
