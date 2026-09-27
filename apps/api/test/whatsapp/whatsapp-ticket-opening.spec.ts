import { PrismaService } from '../../src/database/prisma.service';
import { normalizeInboundMessage } from '../../src/whatsapp/whatsapp-payload.mapper';
import { WhatsappCloudApiClient } from '../../src/whatsapp/whatsapp-cloud-api.client';
import { WhatsappCredentialsCipher } from '../../src/whatsapp/whatsapp-credentials-cipher';
import { WhatsappMediaStorageService } from '../../src/whatsapp/whatsapp-media-storage.service';
import { WhatsappService } from '../../src/whatsapp/whatsapp.service';
import { AiService } from '../../src/ai/ai.service';

const COMPANY_ID = '0bc78439-60ed-4c02-8a40-1ca73af06402';
const CONTACT_ID = '130301b4-e633-4768-8b99-bb58ca03da3e';
const CUSTOMER_ID = 'c10a2a80-4711-4bcf-8593-df38133e5136';
const TICKET_ID = '44a65343-7d55-45da-b8da-54c52909a1d9';
const integration = {
  id: '1d807866-596f-4b53-a1cd-488956e7440b',
  companyId: COMPANY_ID,
  externalAccountId: 'phone-number-id',
  credentialsCiphertext: null,
  credentialsKeyVersion: null,
};

function setup(existingTicket: Record<string, unknown> | null) {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contact: {
      findUnique: jest.fn().mockResolvedValue({ id: CONTACT_ID, customerId: CUSTOMER_ID, displayName: 'Customer' }),
      create: jest.fn(),
      update: jest.fn(),
    },
    customer: { create: jest.fn() },
    ticket: {
      findFirst: jest.fn().mockResolvedValue(existingTicket),
      create: jest.fn().mockResolvedValue({
        id: TICKET_ID,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        contactId: CONTACT_ID,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: { create: jest.fn().mockResolvedValue({ id: 'message-id' }) },
    outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-id' }) },
  };
  const prisma = {
    message: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  const service = new WhatsappService(
    prisma,
    {} as WhatsappCloudApiClient,
    {} as WhatsappCredentialsCipher,
    {} as WhatsappMediaStorageService,
    { classifyInbound: jest.fn().mockResolvedValue({ action: 'DISABLED' }) } as unknown as AiService,
  );
  return { service, transaction };
}

const rawMessage = {
  id: 'wamid.inbound-1',
  from: '5511999999999',
  timestamp: '1780000000',
  type: 'text',
  text: { body: 'Olá' },
};

async function processInbound(service: WhatsappService) {
  const inbound = normalizeInboundMessage(rawMessage);
  if (!inbound) throw new Error('Test message should normalize');
  const processor = service as unknown as {
    processInboundMessage: (
      integrationValue: typeof integration,
      message: typeof inbound,
      displayName: string | null,
    ) => Promise<unknown>;
  };
  return processor.processInboundMessage(integration, inbound, 'Customer');
}

describe('WhatsApp inbound ticket lifecycle', () => {
  it('opens one ticket under a per-contact lock and writes a ticket.created outbox event', async () => {
    const { service, transaction } = setup(null);

    await processInbound(service);

    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(transaction.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY_ID, status: 'OPEN' }) }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'ticket.created' }) }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'message.received' }) }),
    );
  });

  it('reopens a pending ticket when its WhatsApp customer replies', async () => {
    const { service, transaction } = setup({
      id: TICKET_ID,
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      contactId: CONTACT_ID,
      status: 'WAITING_CUSTOMER',
    });

    await processInbound(service);

    expect(transaction.ticket.create).not.toHaveBeenCalled();
    expect(transaction.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: TICKET_ID, status: 'WAITING_CUSTOMER' }),
        data: { status: 'OPEN', closedAt: null },
      }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'ticket.status_changed' }) }),
    );
  });
});
