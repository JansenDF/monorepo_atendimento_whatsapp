import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ContactChannel,
  IntegrationEventStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
  TicketStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  isRecord,
  allowedPriorStatuses,
  mapWhatsappStatus,
  normalizeInboundMessage,
  NormalizedInboundMessage,
  stringValue,
  WhatsappRecord,
  shouldAdvanceMessageStatus,
} from './whatsapp-payload.mapper';
import { WHATSAPP_CREDENTIAL_KEY_VERSION, WHATSAPP_CLOUD_PROVIDER } from './whatsapp.constants';
import { WhatsappCloudApiClient, WhatsappGraphApiError } from './whatsapp-cloud-api.client';
import { WhatsappCredentialsCipher } from './whatsapp-credentials-cipher';
import { WhatsappMediaStorageService } from './whatsapp-media-storage.service';
import {
  SendWhatsappMediaDto,
  SendWhatsappTemplateDto,
  SendWhatsappTextDto,
} from './dto/send-whatsapp-message.dto';

const ACTIVE_TICKET_STATUSES: TicketStatus[] = ['OPEN', 'PENDING', 'BOT', 'WAITING_CUSTOMER'];

type ProcessResult = 'PROCESSED' | 'IGNORED';

export interface ConfigureWhatsappIntegrationInput {
  companyId: string;
  phoneNumberId: string;
  accessToken: string;
  name?: string;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private queueTimer: NodeJS.Timeout | undefined;
  private queueProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudApi: WhatsappCloudApiClient,
    private readonly credentialCipher: WhatsappCredentialsCipher,
    private readonly mediaStorage: WhatsappMediaStorageService,
  ) {}

  onModuleInit(): void {
    this.queueTimer = setInterval(() => void this.processWebhookQueue(), 2_000);
    this.queueTimer.unref();
    void this.processWebhookQueue();
  }

  onModuleDestroy(): void {
    if (this.queueTimer) clearInterval(this.queueTimer);
  }

  async configureIntegration(input: ConfigureWhatsappIntegrationInput): Promise<{
    id: string;
    companyId: string;
    name: string;
    phoneNumberId: string;
    status: 'ACTIVE';
  }> {
    if (
      !input.companyId ||
      !input.phoneNumberId ||
      input.phoneNumberId.length > 255 ||
      !input.accessToken ||
      input.accessToken.length > 4096
    ) {
      throw new BadRequestException('WhatsApp phone number id and access token are required');
    }
    const name = (input.name?.trim() || `WhatsApp ${input.phoneNumberId}`).slice(0, 160);
    const credentialsCiphertext = new Uint8Array(
      this.credentialCipher.encrypt({ accessToken: input.accessToken }),
    );
    const integration = await this.prisma.integration.upsert({
      where: {
        companyId_provider_externalAccountId: {
          companyId: input.companyId,
          provider: WHATSAPP_CLOUD_PROVIDER,
          externalAccountId: input.phoneNumberId,
        },
      },
      create: {
        companyId: input.companyId,
        provider: WHATSAPP_CLOUD_PROVIDER,
        name,
        status: 'ACTIVE',
        externalAccountId: input.phoneNumberId,
        credentialsCiphertext,
        credentialsKeyVersion: WHATSAPP_CREDENTIAL_KEY_VERSION,
      },
      update: {
        name,
        status: 'ACTIVE',
        credentialsCiphertext,
        credentialsKeyVersion: WHATSAPP_CREDENTIAL_KEY_VERSION,
      },
      select: { id: true, companyId: true, name: true, externalAccountId: true, status: true },
    });
    return {
      id: integration.id,
      companyId: integration.companyId,
      name: integration.name,
      phoneNumberId: integration.externalAccountId ?? input.phoneNumberId,
      status: 'ACTIVE',
    };
  }

  async sendText(input: SendWhatsappTextDto): Promise<{ messageId: string; providerMessageId: string }> {
    if (typeof input.body !== 'string' || input.body.trim().length === 0 || input.body.length > 4096) {
      throw new BadRequestException('WhatsApp text body must contain between 1 and 4096 characters');
    }
    return this.sendOutbound(input, {
      type: 'text',
      text: { body: input.body, preview_url: input.previewUrl ?? false },
    }, 'TEXT', input.body, { previewUrl: input.previewUrl ?? false });
  }

  async sendImage(input: SendWhatsappMediaDto): Promise<{ messageId: string; providerMessageId: string }> {
    this.validateMediaText(input);
    const image = this.mediaPayload(input);
    if (input.caption) image.caption = input.caption;
    return this.sendOutbound(input, { type: 'image', image }, 'IMAGE', input.caption ?? null, {
      mediaSource: input.mediaId ? 'media_id' : 'https_url',
      ...(input.mediaId ? { providerMediaId: input.mediaId } : {}),
    });
  }

  async sendDocument(input: SendWhatsappMediaDto): Promise<{ messageId: string; providerMessageId: string }> {
    this.validateMediaText(input);
    const document = this.mediaPayload(input);
    if (input.caption) document.caption = input.caption;
    if (input.fileName) document.filename = input.fileName;
    return this.sendOutbound(input, { type: 'document', document }, 'DOCUMENT', input.caption ?? null, {
      mediaSource: input.mediaId ? 'media_id' : 'https_url',
      ...(input.mediaId ? { providerMediaId: input.mediaId } : {}),
      ...(input.fileName ? { fileName: input.fileName } : {}),
    });
  }

  async sendTemplate(input: SendWhatsappTemplateDto): Promise<{ messageId: string; providerMessageId: string }> {
    if (!/^[a-z0-9_]{1,512}$/i.test(input.name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(input.languageCode)) {
      throw new BadRequestException('WhatsApp template name or language code is invalid');
    }
    const template: Record<string, unknown> = {
      name: input.name,
      language: { code: input.languageCode },
    };
    if (input.components?.length) template.components = input.components;
    return this.sendOutbound(input, { type: 'template', template }, 'TEMPLATE', null, { template });
  }

  async receiveWebhook(payload: unknown): Promise<void> {
    if (
      !isRecord(payload) ||
      payload.object !== 'whatsapp_business_account' ||
      !Array.isArray(payload.entry)
    ) {
      throw new BadRequestException('Invalid WhatsApp webhook payload');
    }

    for (const entryValue of payload.entry) {
      if (!isRecord(entryValue) || !Array.isArray(entryValue.changes)) continue;
      for (const changeValue of entryValue.changes) {
        if (!isRecord(changeValue) || !isRecord(changeValue.value)) continue;
        const value = changeValue.value;
        const metadata = isRecord(value.metadata) ? value.metadata : {};
        const phoneNumberId = stringValue(metadata.phone_number_id);
        if (!phoneNumberId) continue;

        const integration = await this.prisma.integration.findFirst({
          where: {
            provider: WHATSAPP_CLOUD_PROVIDER,
            externalAccountId: phoneNumberId,
            status: { in: ['ACTIVE', 'DEGRADED'] },
          },
        });
        if (!integration) {
          this.logger.warn(`Ignoring WhatsApp webhook for unconfigured phone number id ${phoneNumberId}`);
          continue;
        }
        await this.enqueueWebhookChange(integration, changeValue);
      }
    }
    void this.processWebhookQueue();
  }

  private async enqueueWebhookChange(
    integration: { id: string; companyId: string; externalAccountId: string | null },
    change: WhatsappRecord,
  ): Promise<void> {
    const keyMaterial = `webhook.change:${integration.externalAccountId}:${JSON.stringify(change)}`;
    const idempotencyKey = createHash('sha256').update(keyMaterial).digest('hex');
    try {
      await this.prisma.integrationEvent.create({
        data: {
          companyId: integration.companyId,
          integrationId: integration.id,
          eventType: 'whatsapp.webhook.change',
          idempotencyKey,
          status: IntegrationEventStatus.RECEIVED,
          payload: this.asJson(change),
        },
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.prisma.integrationEvent.findUnique({
        where: {
          companyId_integrationId_idempotencyKey: {
            companyId: integration.companyId,
            integrationId: integration.id,
            idempotencyKey,
          },
        },
      });
      if (existing?.status === IntegrationEventStatus.FAILED) {
        await this.prisma.integrationEvent.updateMany({
          where: {
            id: existing.id,
            status: IntegrationEventStatus.FAILED,
            attemptCount: existing.attemptCount,
          },
          data: { status: IntegrationEventStatus.RECEIVED, receivedAt: new Date(), errorCode: null },
        });
      }
    }
  }

  private async processWebhookQueue(): Promise<void> {
    if (this.queueProcessing) return;
    this.queueProcessing = true;
    try {
      const now = Date.now();
      const candidates = await this.prisma.integrationEvent.findMany({
        where: {
          eventType: 'whatsapp.webhook.change',
          status: { in: [IntegrationEventStatus.RECEIVED, IntegrationEventStatus.FAILED, IntegrationEventStatus.PROCESSING] },
          attemptCount: { lt: 10 },
        },
        orderBy: { receivedAt: 'asc' },
        take: 50,
        include: { integration: true },
      });
      const eligible = candidates.filter((event) => {
        if (event.status === IntegrationEventStatus.RECEIVED) return true;
        if (event.status === IntegrationEventStatus.FAILED) {
          const delay = Math.min(60_000, 1_000 * 2 ** Math.max(0, event.attemptCount - 1));
          return now - event.updatedAt.getTime() >= delay;
        }
        return event.status === IntegrationEventStatus.PROCESSING && now - event.updatedAt.getTime() >= 120_000;
      });
      await Promise.all(eligible.slice(0, 5).map((event) => this.processQueuedWebhookChange(event)));
    } catch (error) {
      this.logger.error('WhatsApp webhook queue poll failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.queueProcessing = false;
    }
  }

  private async processQueuedWebhookChange(event: {
    id: string;
    companyId: string;
    status: IntegrationEventStatus;
    attemptCount: number;
    payload: Prisma.JsonValue;
    integration: {
      id: string;
      companyId: string;
      externalAccountId: string | null;
      credentialsCiphertext: Uint8Array | null;
      credentialsKeyVersion: string | null;
    };
  }): Promise<void> {
    const claim = await this.prisma.integrationEvent.updateMany({
      where: { id: event.id, status: event.status, attemptCount: event.attemptCount },
      data: { status: IntegrationEventStatus.PROCESSING, attemptCount: { increment: 1 } },
    });
    if (claim.count !== 1) return;

    try {
      await this.processWebhookChange(event.integration, event.payload);
      await this.prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: IntegrationEventStatus.PROCESSED, processedAt: new Date(), errorCode: null },
      });
    } catch (error) {
      await this.prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: IntegrationEventStatus.FAILED, errorCode: this.errorCode(error) },
      });
      this.logger.error(`WhatsApp webhook batch ${event.id} failed; it will be retried`);
    }
  }

  private async processWebhookChange(
    integration: {
      id: string;
      companyId: string;
      externalAccountId: string | null;
      credentialsCiphertext: Uint8Array | null;
      credentialsKeyVersion: string | null;
    },
    payload: Prisma.JsonValue,
  ): Promise<void> {
    if (!isRecord(payload) || !isRecord(payload.value)) return;
    const value = payload.value;
    const metadata = isRecord(value.metadata) ? value.metadata : {};
    if (stringValue(metadata.phone_number_id) !== integration.externalAccountId) {
      throw new ServiceUnavailableException('WhatsApp webhook phone number does not match its integration');
    }

    const contactNames = new Map<string, string>();
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];
    for (const contact of contacts) {
      if (!isRecord(contact)) continue;
      const waId = stringValue(contact.wa_id);
      const profile = isRecord(contact.profile) ? contact.profile : {};
      const name = stringValue(profile.name);
      if (waId && name) contactNames.set(waId, name.slice(0, 160));
    }

    const messages = Array.isArray(value.messages) ? value.messages : [];
    for (const rawMessage of messages) {
      const normalized = normalizeInboundMessage(rawMessage);
      if (!normalized) {
        await this.persistIgnoredEvent(integration, 'messages.invalid', rawMessage);
        continue;
      }
      await this.processEvent(
        integration,
        `message.${normalized.type.toLowerCase()}`,
        `message:${normalized.providerMessageId}`,
        rawMessage,
        () => this.processInboundMessage(integration, normalized, contactNames.get(normalized.sender) ?? null),
      );
    }

    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    for (const rawStatus of statuses) {
      if (!isRecord(rawStatus)) {
        await this.persistIgnoredEvent(integration, 'statuses.invalid', rawStatus);
        continue;
      }
      const providerMessageId = stringValue(rawStatus.id);
      const status = stringValue(rawStatus.status);
      const timestamp = stringValue(rawStatus.timestamp) ?? 'unknown';
      if (!providerMessageId || !status) {
        await this.persistIgnoredEvent(integration, 'statuses.invalid', rawStatus);
        continue;
      }
      await this.processEvent(
        integration,
        `message.status.${status}`,
        `status:${providerMessageId}:${status}:${timestamp}`,
        rawStatus,
        () => this.processMessageStatus(integration.companyId, rawStatus),
      );
    }

    if (messages.length === 0 && statuses.length === 0) {
      await this.persistIgnoredEvent(integration, `webhook.${stringValue(payload.field) ?? 'unknown'}`, payload);
    }
  }

  private async sendOutbound(
    input: SendWhatsappTextDto | SendWhatsappMediaDto | SendWhatsappTemplateDto,
    messagePayload: Record<string, unknown>,
    type: MessageType,
    body: string | null,
    outboundMetadata: Record<string, unknown> = {},
  ): Promise<{ messageId: string; providerMessageId: string }> {
    if (input.companyId.length === 0 || input.ticketId.length === 0 || input.integrationId.length === 0) {
      throw new BadRequestException('A company, integration, and ticket are required to send a WhatsApp message');
    }

    const [ticket, integration] = await Promise.all([
      this.prisma.ticket.findFirst({
        where: { id: input.ticketId, companyId: input.companyId, channel: 'WHATSAPP' },
        include: { contact: true },
      }),
      this.prisma.integration.findFirst({
        where: {
          id: input.integrationId,
          companyId: input.companyId,
          provider: WHATSAPP_CLOUD_PROVIDER,
          status: 'ACTIVE',
        },
      }),
    ]);
    if (!ticket?.contact || ticket.contact.channel !== 'WHATSAPP') {
      throw new BadRequestException('The WhatsApp ticket has no WhatsApp contact');
    }
    if (!integration?.externalAccountId || !integration.credentialsCiphertext) {
      throw new ServiceUnavailableException('The WhatsApp integration is not fully configured');
    }
    if (integration.credentialsKeyVersion !== WHATSAPP_CREDENTIAL_KEY_VERSION) {
      throw new ServiceUnavailableException('The WhatsApp integration uses an unsupported credential key version');
    }

    const message = await this.prisma.message.create({
      data: {
        companyId: input.companyId,
        ticketId: ticket.id,
        direction: 'OUTBOUND',
        type,
        status: 'QUEUED',
        body,
        metadata: { integrationId: integration.id, sendAttempts: 0, ...outboundMetadata },
      },
    });

    let result: { providerMessageId: string; attempts: number };
    try {
      const { accessToken } = this.credentialCipher.decrypt(
        integration.credentialsCiphertext,
        integration.credentialsKeyVersion,
      );
      result = await this.cloudApi.sendMessage(integration.externalAccountId, accessToken, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: ticket.contact.address,
        ...messagePayload,
        biz_opaque_callback_data: message.id,
      });
    } catch (error) {
      const attempts = error instanceof WhatsappGraphApiError ? error.attempts : 1;
      const outcomeUnknown =
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException ||
        (error instanceof WhatsappGraphApiError && error.httpStatus >= 500);
      const errorCode = outcomeUnknown
        ? 'WHATSAPP_SEND_OUTCOME_UNKNOWN'
        : error instanceof WhatsappGraphApiError
          ? error.providerCode
          : 'WHATSAPP_SEND_FAILED';
      await this.prisma.message.update({
        where: { id_companyId: { id: message.id, companyId: input.companyId } },
        data: {
          status: outcomeUnknown ? 'QUEUED' : 'FAILED',
          metadata: {
            integrationId: integration.id,
            sendAttempts: attempts,
            errorCode,
            sendOutcomeUnknown: outcomeUnknown,
            ...outboundMetadata,
          },
        },
      });
      throw error;
    }

    // Persist the successful send event atomically with the final provider ID.
    // A fast webhook may already have advanced QUEUED to DELIVERED or READ.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.message.updateMany({
        where: { id: message.id, companyId: input.companyId, status: 'QUEUED' },
        data: { status: 'SENT' },
      });
      await transaction.message.update({
        where: { id_companyId: { id: message.id, companyId: input.companyId } },
        data: {
          providerMessageId: result.providerMessageId,
          metadata: { integrationId: integration.id, sendAttempts: result.attempts, ...outboundMetadata },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          companyId: input.companyId,
          aggregateType: 'message',
          aggregateId: message.id,
          eventType: 'message.sent',
          idempotencyKey: `message.sent:${message.id}`,
          payload: { ticketId: ticket.id, messageId: message.id },
        },
      });
    });
    return { messageId: message.id, providerMessageId: result.providerMessageId };
  }

  private mediaPayload(input: SendWhatsappMediaDto): Record<string, unknown> {
    const hasMediaId = typeof input.mediaId === 'string' && input.mediaId.length > 0;
    const hasUrl = typeof input.url === 'string' && input.url.length > 0;
    if (hasMediaId === hasUrl) {
      throw new BadRequestException('Provide exactly one WhatsApp media id or HTTPS URL');
    }
    if (hasUrl) {
      try {
        const parsed = new URL(input.url as string);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid URL');
      } catch {
        throw new BadRequestException('WhatsApp media URL must be a valid HTTPS URL');
      }
    }
    return hasMediaId ? { id: input.mediaId } : { link: input.url };
  }

  private validateMediaText(input: SendWhatsappMediaDto): void {
    if (input.caption !== undefined && input.caption.length > 1024) {
      throw new BadRequestException('WhatsApp media caption cannot exceed 1024 characters');
    }
    if (input.fileName !== undefined && (input.fileName.length === 0 || input.fileName.length > 255)) {
      throw new BadRequestException('WhatsApp document filename must contain between 1 and 255 characters');
    }
  }

  private async processInboundMessage(
    integration: { id: string; companyId: string; externalAccountId: string | null; credentialsCiphertext: Uint8Array | null; credentialsKeyVersion: string | null },
    inbound: NormalizedInboundMessage,
    displayName: string | null,
  ): Promise<ProcessResult> {
    const existing = await this.prisma.message.findFirst({
      where: { companyId: integration.companyId, providerMessageId: inbound.providerMessageId },
      include: { attachments: true },
    });
    let messageId = existing?.id;
    let attachments: Array<{ id: string; storageKey: string }> = existing?.attachments ?? [];
    if (!existing) {
      try {
        const created = await this.prisma.$transaction(async (transaction) => {
          let contact = await transaction.contact.findUnique({
            where: {
              companyId_channel_address: {
                companyId: integration.companyId,
                channel: ContactChannel.WHATSAPP,
                address: inbound.sender,
              },
            },
          });
          if (!contact) {
            const customer = await transaction.customer.create({
              data: {
                companyId: integration.companyId,
                displayName: displayName ?? `WhatsApp ${inbound.sender}`,
              },
            });
            contact = await transaction.contact.create({
              data: {
                companyId: integration.companyId,
                customerId: customer.id,
                channel: ContactChannel.WHATSAPP,
                address: inbound.sender,
                displayName,
              },
            });
          } else if (displayName && !contact.displayName) {
            contact = await transaction.contact.update({
              where: { id_companyId: { id: contact.id, companyId: integration.companyId } },
              data: { displayName },
            });
          }

          // Serialize ticket lookup/creation per tenant and contact so concurrent
          // webhook deliveries cannot create two active conversations.
          await transaction.$queryRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${integration.companyId} || ':' || ${contact.id}, 0))
          `;

          let ticket = await transaction.ticket.findFirst({
            where: {
              companyId: integration.companyId,
              contactId: contact.id,
              status: { in: ACTIVE_TICKET_STATUSES },
            },
            orderBy: { updatedAt: 'desc' },
          });
          if (!ticket) {
            ticket = await transaction.ticket.create({
              data: {
                companyId: integration.companyId,
                customerId: contact.customerId,
                contactId: contact.id,
                subject: `WhatsApp — ${displayName ?? inbound.sender}`.slice(0, 240),
                channel: ContactChannel.WHATSAPP,
                status: 'OPEN',
              },
            });
            await transaction.outboxEvent.create({
              data: {
                companyId: integration.companyId,
                aggregateType: 'ticket',
                aggregateId: ticket.id,
                eventType: 'ticket.created',
                idempotencyKey: `ticket.created:${ticket.id}`,
                payload: {
                  ticketId: ticket.id,
                  customerId: ticket.customerId,
                  contactId: ticket.contactId,
                  channel: 'WHATSAPP',
                  source: 'whatsapp_webhook',
                },
              },
            });
          } else if (ticket.status === 'PENDING' || ticket.status === 'WAITING_CUSTOMER') {
            const previousStatus = ticket.status;
            const reopened = await transaction.ticket.updateMany({
              where: {
                id: ticket.id,
                companyId: integration.companyId,
                status: previousStatus,
              },
              data: { status: 'OPEN', closedAt: null },
            });
            if (reopened.count === 1) {
              ticket = { ...ticket, status: 'OPEN', closedAt: null };
              await transaction.outboxEvent.create({
                data: {
                  companyId: integration.companyId,
                  aggregateType: 'ticket',
                  aggregateId: ticket.id,
                  eventType: 'ticket.status_changed',
                  idempotencyKey: `ticket.customer_replied:${inbound.providerMessageId}`,
                  payload: {
                    ticketId: ticket.id,
                    previousStatus,
                    status: 'OPEN',
                    source: 'whatsapp_webhook',
                  },
                },
              });
            }
          }

          const newMessage = await transaction.message.create({
            data: {
              companyId: integration.companyId,
              ticketId: ticket.id,
              direction: MessageDirection.INBOUND,
              type: inbound.type,
              status: MessageStatus.RECEIVED,
              body: inbound.body,
              providerMessageId: inbound.providerMessageId,
              metadata: {
                integrationId: integration.id,
                providerTimestamp: inbound.providerTimestamp,
                sender: inbound.sender,
                source: 'whatsapp_cloud_api',
              },
            },
          });
          await transaction.outboxEvent.create({
            data: {
              companyId: integration.companyId,
              aggregateType: 'message',
              aggregateId: newMessage.id,
              eventType: 'message.received',
              idempotencyKey: `message.received:${newMessage.id}`,
              payload: { ticketId: ticket.id, messageId: newMessage.id },
            },
          });
          let attachment: { id: string; storageKey: string } | null = null;
          if (inbound.media) {
            const storageKey = `pending/${integration.companyId}/${newMessage.id}/${inbound.media.id}`;
            attachment = await transaction.messageAttachment.create({
              data: {
                companyId: integration.companyId,
                messageId: newMessage.id,
                type: inbound.type,
                fileName: inbound.media.fileName,
                mimeType: inbound.media.mimeType,
                byteSize: 0n,
                storageKey,
                checksumSha256: inbound.media.sha256,
                providerMediaId: inbound.media.id,
                metadata: { storageState: 'PENDING_DOWNLOAD' },
              },
              select: { id: true, storageKey: true },
            });
          }
          return { messageId: newMessage.id, attachment: attachment ? [attachment] : [] };
        });
        messageId = created.messageId;
        attachments = created.attachment;
      } catch (error) {
        if (!this.isUniqueConflict(error)) throw error;
        const duplicate = await this.prisma.message.findFirst({
          where: { companyId: integration.companyId, providerMessageId: inbound.providerMessageId },
          include: { attachments: true },
        });
        if (!duplicate) throw error;
        messageId = duplicate.id;
        attachments = duplicate.attachments;
      }
    }

    if (inbound.media && integration.credentialsCiphertext && integration.externalAccountId) {
      const pending = attachments.find((attachment) => attachment.storageKey.startsWith('pending/'));
      if (pending && messageId) {
        const { accessToken } = this.credentialCipher.decrypt(
          integration.credentialsCiphertext,
          integration.credentialsKeyVersion,
        );
        const downloaded = await this.cloudApi.downloadMedia({
          mediaId: inbound.media.id,
          accessToken,
          expectedMimeType: inbound.media.mimeType,
          ...(inbound.media.sha256 ? { expectedSha256: inbound.media.sha256 } : {}),
        });
        const safeName = this.safeFileName(inbound.media.fileName, inbound.media.id, downloaded.contentType);
        const objectKey = `${integration.companyId}/whatsapp/${messageId}/${inbound.media.id}`;
        const storageKey = await this.mediaStorage.store({
          key: objectKey,
          contentType: downloaded.contentType,
          body: downloaded.bytes,
          sha256: downloaded.sha256Hex,
        });
        await this.prisma.messageAttachment.update({
          where: { id_companyId: { id: pending.id, companyId: integration.companyId } },
          data: {
            storageKey,
            fileName: safeName,
            mimeType: downloaded.contentType,
            byteSize: BigInt(downloaded.byteSize),
            checksumSha256: downloaded.sha256Hex,
            metadata: { storageState: 'STORED' },
          },
        });
      }
    } else if (inbound.media) {
      this.logger.error(`WhatsApp media integration ${integration.id} has no credentials or phone number configuration`);
      throw new ServiceUnavailableException('WhatsApp media integration is not configured for media downloads');
    }
    return 'PROCESSED';
  }

  private async processMessageStatus(companyId: string, rawStatus: WhatsappRecord): Promise<ProcessResult> {
    const providerMessageId = stringValue(rawStatus.id);
    const status = stringValue(rawStatus.status);
    if (!providerMessageId || !status) return 'IGNORED';
    const nextStatus = mapWhatsappStatus(status);
    if (!nextStatus) return 'IGNORED';

    const callbackData = stringValue(rawStatus.biz_opaque_callback_data);
    const opaqueCallbackData = callbackData && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callbackData)
      ? callbackData
      : null;
    const message = await this.prisma.message.findFirst({
      where: {
        companyId,
        OR: [
          { providerMessageId },
          ...(opaqueCallbackData ? [{ id: opaqueCallbackData }] : []),
        ],
      },
    });
    if (!message) return 'IGNORED';
    if (!shouldAdvanceMessageStatus(message.status, nextStatus)) {
      if (!message.providerMessageId) {
        await this.prisma.message.update({
          where: { id_companyId: { id: message.id, companyId } },
          data: { providerMessageId },
        });
      }
      return 'PROCESSED';
    }

    const errors = Array.isArray(rawStatus.errors) ? rawStatus.errors : [];
    const firstError = isRecord(errors[0]) ? errors[0] : null;
    const errorCode = firstError
      ? stringValue(firstError.code) ?? (typeof firstError.code === 'number' ? String(firstError.code) : null)
      : null;
    const update = await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.message.updateMany({
        where: {
          id: message.id,
          companyId,
          status: { in: allowedPriorStatuses(nextStatus) },
        },
        data: {
          status: nextStatus,
          providerMessageId,
          metadata: {
            ...((isRecord(message.metadata) ? message.metadata : {}) as Prisma.InputJsonObject),
            lastProviderStatus: status,
            providerStatusTimestamp: stringValue(rawStatus.timestamp),
            ...(errorCode ? { providerErrorCode: errorCode } : {}),
          },
        },
      });
      if (changed.count === 1) {
        await transaction.outboxEvent.create({
          data: {
            companyId,
            aggregateType: 'message',
            aggregateId: message.id,
            eventType: 'message.status_changed',
            idempotencyKey: `message.status_changed:${message.id}:${nextStatus}`,
            payload: { ticketId: message.ticketId, messageId: message.id },
          },
        });
      }
      return changed;
    });
    if (update.count === 0 && !message.providerMessageId) {
      await this.prisma.message.updateMany({
        where: { id: message.id, companyId, providerMessageId: null },
        data: { providerMessageId },
      });
    }
    return 'PROCESSED';
  }

  private async processEvent(
    integration: { id: string; companyId: string },
    eventType: string,
    idempotencySource: string,
    payload: unknown,
    processor: () => Promise<ProcessResult>,
  ): Promise<void> {
    const idempotencyKey = createHash('sha256').update(idempotencySource).digest('hex');
    const where = {
      companyId_integrationId_idempotencyKey: {
        companyId: integration.companyId,
        integrationId: integration.id,
        idempotencyKey,
      },
    };
    let event = await this.prisma.integrationEvent.findUnique({ where });
    if (event?.status === IntegrationEventStatus.PROCESSED || event?.status === IntegrationEventStatus.IGNORED) {
      return;
    }
    if (
      event?.status === IntegrationEventStatus.PROCESSING &&
      Date.now() - event.receivedAt.getTime() < 120_000
    ) {
      throw new ServiceUnavailableException('WhatsApp webhook event is already being processed');
    }

    try {
      if (event) {
        const claimed = await this.prisma.integrationEvent.updateMany({
          where: {
            id: event.id,
            status: event.status,
            attemptCount: event.attemptCount,
          },
          data: {
            status: IntegrationEventStatus.PROCESSING,
            receivedAt: new Date(),
            attemptCount: { increment: 1 },
            errorCode: null,
          },
        });
        if (claimed.count !== 1) {
          throw new ServiceUnavailableException('WhatsApp webhook event is already being processed');
        }
      } else {
        event = await this.prisma.integrationEvent.create({
            data: {
              companyId: integration.companyId,
              integrationId: integration.id,
              eventType,
              idempotencyKey,
              status: IntegrationEventStatus.PROCESSING,
              payload: this.asJson(payload),
              attemptCount: 1,
            },
          });
      }
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const competingEvent = await this.prisma.integrationEvent.findUnique({ where });
        if (
          competingEvent?.status === IntegrationEventStatus.PROCESSED ||
          competingEvent?.status === IntegrationEventStatus.IGNORED
        ) {
          return;
        }
        throw new ServiceUnavailableException('WhatsApp webhook event is already being processed');
      }
      throw error;
    }

    try {
      const result = await processor();
      await this.prisma.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: result === 'IGNORED' ? IntegrationEventStatus.IGNORED : IntegrationEventStatus.PROCESSED,
          processedAt: new Date(),
          errorCode: null,
        },
      });
    } catch (error) {
      await this.prisma.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: IntegrationEventStatus.FAILED,
          errorCode: this.errorCode(error),
        },
      });
      this.logger.error(`WhatsApp webhook event processing failed (${eventType}, event ${event.id})`);
      throw new ServiceUnavailableException('WhatsApp webhook event could not be processed');
    }
  }

  private async persistIgnoredEvent(
    integration: { id: string; companyId: string },
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    const source = `${eventType}:${createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex')}`;
    await this.processEvent(integration, eventType, source, payload, async () => 'IGNORED');
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private errorCode(error: unknown): string {
    if (error instanceof WhatsappGraphApiError && error.providerCode) return error.providerCode;
    if (error instanceof Error && error.name === 'BadGatewayException') return 'INVALID_PROVIDER_RESPONSE';
    return 'WHATSAPP_EVENT_PROCESSING_FAILED';
  }

  private safeFileName(provided: string | null, mediaId: string, mimeType: string): string {
    const cleaned = provided?.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 240);
    if (cleaned) return cleaned;
    const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9.+-]/gi, '') || 'bin';
    return `${mediaId}.${extension}`.slice(0, 255);
  }
}
