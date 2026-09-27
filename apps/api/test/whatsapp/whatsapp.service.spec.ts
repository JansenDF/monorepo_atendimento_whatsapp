import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { WhatsappCloudApiClient } from '../../src/whatsapp/whatsapp-cloud-api.client';
import { WhatsappCredentialsCipher } from '../../src/whatsapp/whatsapp-credentials-cipher';
import { WhatsappMediaStorageService } from '../../src/whatsapp/whatsapp-media-storage.service';
import { WhatsappService } from '../../src/whatsapp/whatsapp.service';
import { AiService } from '../../src/ai/ai.service';

describe('WhatsappService outbound persistence', () => {
  const companyId = '0bc78439-60ed-4c02-8a40-1ca73af06402';
  const ticketId = '44a65343-7d55-45da-b8da-54c52909a1d9';
  const integrationId = '1d807866-596f-4b53-a1cd-488956e7440b';
  const messageId = 'b8e43375-7888-416a-a284-a5c743caa0c6';
  const integration = {
    id: integrationId,
    companyId,
    status: 'ACTIVE',
    provider: 'WHATSAPP_CLOUD_API',
    externalAccountId: 'phone-number-id',
    credentialsCiphertext: Buffer.from('encrypted'),
    credentialsKeyVersion: 'v1',
  };
  const ticket = {
    id: ticketId,
    contact: { channel: 'WHATSAPP', address: '5511999999999' },
  };

  function setup(sendMessage: jest.Mock) {
    const prisma = {
      ticket: { findFirst: jest.fn().mockResolvedValue(ticket) },
      integration: { findFirst: jest.fn().mockResolvedValue(integration) },
      message: {
        create: jest.fn().mockResolvedValue({ id: messageId }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: messageId }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-id' }) },
    } as unknown as PrismaService;
    const transaction = {
      message: prisma.message,
      outboxEvent: prisma.outboxEvent,
    };
    prisma.$transaction = jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)) as unknown as typeof prisma.$transaction;
    const cloudApi = { sendMessage } as unknown as WhatsappCloudApiClient;
    const credentials = {
      decrypt: jest.fn().mockReturnValue({ accessToken: 'secret-token' }),
    } as unknown as WhatsappCredentialsCipher;
    const mediaStorage = {} as WhatsappMediaStorageService;
    const ai = { classifyInbound: jest.fn().mockResolvedValue({ action: 'DISABLED' }) } as unknown as AiService;

    return {
      service: new WhatsappService(prisma, cloudApi, credentials, mediaStorage, ai),
      prisma,
    };
  }

  it('persists a queued message, sends to the ticket contact, and saves the provider id', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ providerMessageId: 'wamid.outbound', attempts: 1 });
    const { service, prisma } = setup(sendMessage);

    await expect(
      service.sendText({ companyId, integrationId, ticketId, body: 'Olá' }),
    ).resolves.toEqual({ messageId, providerMessageId: 'wamid.outbound' });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'OUTBOUND', status: 'QUEUED' }) }),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'phone-number-id',
      'secret-token',
      expect.objectContaining({ to: '5511999999999', biz_opaque_callback_data: messageId }),
    );
    expect(prisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'QUEUED' }) }),
    );
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerMessageId: 'wamid.outbound' }) }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'message.sent' }) }),
    );
  });

  it('keeps an ambiguous timeout queued so a later provider status can reconcile it', async () => {
    const sendMessage = jest.fn().mockRejectedValue(new ServiceUnavailableException('timeout'));
    const { service, prisma } = setup(sendMessage);

    await expect(service.sendText({ companyId, integrationId, ticketId, body: 'Olá' })).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          metadata: expect.objectContaining({ sendOutcomeUnknown: true }),
        }),
      }),
    );
  });
});

describe('WhatsappService webhook inbox', () => {
  it('durably enqueues a signed provider change for background processing', async () => {
    const integration = {
      id: '1d807866-596f-4b53-a1cd-488956e7440b',
      companyId: '0bc78439-60ed-4c02-8a40-1ca73af06402',
      externalAccountId: 'phone-number-id',
      status: 'ACTIVE',
    };
    const prisma = {
      integration: { findFirst: jest.fn().mockResolvedValue(integration) },
      integrationEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const service = new WhatsappService(
      prisma,
      {} as WhatsappCloudApiClient,
      {} as WhatsappCredentialsCipher,
      {} as WhatsappMediaStorageService,
      { classifyInbound: jest.fn().mockResolvedValue({ action: 'DISABLED' }) } as unknown as AiService,
    );

    await service.receiveWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-number-id' },
                messages: [{ id: 'wamid.received', from: '5511999999999', type: 'text', text: { body: 'Oi' } }],
              },
            },
          ],
        },
      ],
    });

    expect(prisma.integrationEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'whatsapp.webhook.change',
          status: 'RECEIVED',
          integrationId: integration.id,
        }),
      }),
    );
  });
});
