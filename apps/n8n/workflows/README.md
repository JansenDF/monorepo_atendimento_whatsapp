# Workflows exportáveis

Os quatro workflows abaixo são exports JSON importáveis pelo n8n. Eles ficam inativos após a importação para que as credenciais, as URLs e os contratos do backend sejam configurados antes da publicação.

| Arquivo | Webhook | Fluxo |
| --- | --- | --- |
| [01-boas-vindas.json](./01-boas-vindas.json) | `POST /webhook/whatsapp-boas-vindas` | Busca o cliente, verifica se a saudação ainda é devida e envia uma mensagem uma única vez. |
| [02-qualificacao.json](./02-qualificacao.json) | `POST /webhook/whatsapp-qualificacao` | Avança os campos nome, empresa e interesse, salva cada resposta no backend e envia a próxima pergunta. |
| [03-suporte.json](./03-suporte.json) | `POST /webhook/whatsapp-suporte` | Lê as FAQs da empresa, classifica com OpenAI e responde somente com correspondência exata de FAQ e score maior que 85; nos outros casos encaminha o ticket. |
| [04-pesquisa-nps.json](./04-pesquisa-nps.json) | `POST /webhook/whatsapp-ticket-closed-nps` | Envia uma pergunta NPS após receber `ticket.closed`; usa idempotência pelo ticket. |

## Importação e configuração

1. No n8n, importe cada JSON usando **Import from File**.
2. Para cada Webhook, selecione uma credencial **Header Auth** de entrada. O backend deve usar o mesmo segredo no header configurado.
3. Nos nós HTTP Request, selecione uma credencial **Header Auth** para a API, com `Authorization: Bearer <token>`; no workflow de suporte, selecione também a credencial da OpenAI com esse header.
4. Altere `http://api:3001` nos nós HTTP Request para a URL alcançável pela instância n8n. `api:3001` é apenas o nome/porta de serviço esperado numa rede Docker compartilhada; este repositório ainda não declara uma rede Compose.
5. Depois de configurar credenciais, rotas e webhooks de origem, publique/ative cada workflow e use sua URL de produção. A URL de teste só recebe eventos enquanto o editor está escutando. [Documentação oficial do Webhook n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)

Os JSONs não carregam IDs ou valores de credenciais. Isso evita exportar segredos e permite associar credenciais diferentes em cada instalação. O Webhook node usa autenticação por header e as chamadas HTTP usam credencial genérica Header Auth.

## Contrato de evento de entrada

O backend deve enviar eventos por `POST` autenticado aos webhooks de produção. Mensagens recebidas usam este formato comum:

```json
{
  "eventId": "evt_123",
  "eventType": "message.received",
  "companyId": "uuid-da-empresa",
  "ticketId": "uuid-do-ticket",
  "integrationId": "uuid-da-integracao-whatsapp",
  "customerId": "uuid-do-cliente",
  "contact": { "id": "uuid-do-contato", "name": "Ana", "phone": "+5511999999999" },
  "message": { "id": "uuid-da-mensagem", "type": "TEXT", "text": "Preciso de ajuda" }
}
```

O workflow de qualificação também aceita `qualification.requested` para iniciar a coleta sem resposta anterior. Respostas seguintes chegam como `message.received`; o dispatcher deve enviá-las ao webhook enquanto a qualificação estiver ativa. O workflow NPS recebe `eventType: "ticket.closed"`, os identificadores de empresa/ticket/cliente/integração e o telefone do contato (`contact.phone`).

O evento deve ser enviado somente aos workflows apropriados. Em particular, não encaminhe toda mensagem ao workflow de boas-vindas: a consulta de cliente precisa retornar `welcomeRequired: false` depois da primeira saudação. O endpoint de qualificação deve ignorar eventos quando não houver uma coleta ativa e impedir que o próprio texto enviado pelo bot seja tratado como resposta do cliente.

## Contratos de API requeridos

Os seguintes contratos são usados pelos nós HTTP Request. A API atual ainda não implementa os endpoints internos marcados como novos; os workflows importam, mas não executarão ponta a ponta até esses endpoints e o dispatcher estarem disponíveis.

| Método e rota | Usado por | Contrato esperado |
| --- | --- | --- |
| `GET /internal/automation/customers/resolve?companyId=…&phone=…` | Boas-vindas | Responde `{ customerId, customerName, isRegistered, welcomeRequired }`; `welcomeRequired` deve ser idempotente por empresa/cliente. **Novo.** |
| `POST /internal/automation/qualification/advance` | Qualificação | Recebe `eventId`, empresa, ticket, cliente, `messageId`, `replyText` e `fields: ["name","company","interest"]`; salva a resposta corrente uma vez e responde `{ shouldSend, completed, nextField, customerName, completionMessage, idempotencyKey }`. `nextField` é `name`, `company` ou `interest`. **Novo.** |
| `POST /internal/automation/messages/text` | Todos | Recebe empresa, integração, ticket, `body` e `idempotencyKey`; valida o tenant e resolve o destinatário pelo contato do ticket antes de chamar `WhatsappService.sendText()`. Deve persistir/deduplicar a chave idempotente antes do envio para não duplicar mensagens em retries. **Novo adaptador HTTP.** |
| `GET /ai/faqs` | Suporte | Rota existente; retorna FAQs ativas da empresa autenticada. Exige JWT com papel `ADMIN` ou `SUPERVISOR`. |
| `POST /internal/automation/ai/classifications` | Suporte | Persiste evento/mensagem, provider, modelo, prompt, resposta, intenção, score e outcome; idempotente por mensagem. **Novo.** |
| `POST /internal/automation/tickets/handoff` | Suporte | Recebe empresa, ticket, mensagem, motivo, intenção e score; encaminha o ticket para uma fila humana e registra a transição/outbox. **Novo.** |

Também falta despachar `message.received`, `qualification.requested` e `ticket.closed` do outbox da API para os webhooks autenticados. O código existente grava `ticket.closed` no outbox, mas o publisher atual não entrega esses eventos ao n8n. Seu payload de encerramento contém `ticketId`, status anterior/novo e `actorId`; o dispatcher precisa enriquecer o evento com empresa, cliente, integração WhatsApp e telefone antes de chamar o webhook NPS. Essa entrega deve usar retry com backoff e preservar `eventId`; o endpoint de envio deve tratar `Idempotency-Key` para que retries não dupliquem mensagens.

## Segurança e isolamento por empresa

O token usado nos nós de API precisa ser uma credencial de serviço com contexto de empresa validado. O `companyId` do corpo/query não pode ser considerado autorização. A API atual protege `GET /ai/faqs` com JWT de usuário e não oferece ainda autenticação de serviço para esses fluxos; não use um token de administrador compartilhado entre empresas. A implementação das rotas internas deve derivar/verificar o tenant na credencial, validar o vínculo de ticket/cliente/integração e limitar os webhooks por segredo e rede quando possível.

O classificador chama a [Responses API](https://platform.openai.com/docs/api-reference/responses) com Structured Outputs em JSON Schema. A validação posterior no workflow também exige que a resposta seja exatamente uma das respostas cadastradas, além do score maior que 85; falha da OpenAI, FAQ indisponível, score menor/igual a 85 ou resposta fora da lista leva ao handoff.
