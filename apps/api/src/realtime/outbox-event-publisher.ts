import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ChatGateway } from './chat.gateway';

const POLL_INTERVAL_MS = 1_000;
const CLAIM_SIZE = 100;
const MAX_ATTEMPTS = 15;

interface ClaimedOutboxEvent {
  id: string;
  companyId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
  claimedAt: Date;
}

interface RealtimeEvent {
  name: string;
  ticketId: string;
  payload: Record<string, string>;
}

@Injectable()
export class OutboxEventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxEventPublisher.name);
  private timer?: ReturnType<typeof setInterval>;
  private isDraining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain(), POLL_INTERVAL_MS);
    this.timer.unref?.();
    void this.drain();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async drain(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      while (true) {
        const events = await this.claimBatch();
        if (events.length === 0) return;
        for (const event of events) await this.publish(event);
      }
    } catch {
      this.logger.error('Realtime outbox polling failed; the next poll will retry');
    } finally {
      this.isDraining = false;
    }
  }

  private claimBatch(): Promise<ClaimedOutboxEvent[]> {
    return this.prisma.$transaction((transaction) => transaction.$queryRaw<ClaimedOutboxEvent[]>`
      WITH claimable AS (
        SELECT id
        FROM outbox_events
        WHERE (status = 'PENDING' AND available_at <= NOW())
          OR (status = 'PROCESSING' AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '60 seconds'))
        ORDER BY created_at ASC
        LIMIT ${CLAIM_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS event
      SET status = 'PROCESSING',
          claimed_at = DATE_TRUNC('milliseconds', NOW()),
          attempt_count = event.attempt_count + 1,
          updated_at = NOW()
      FROM claimable
      WHERE event.id = claimable.id
      RETURNING event.id,
        event.company_id AS "companyId",
        event.aggregate_type AS "aggregateType",
        event.aggregate_id AS "aggregateId",
        event.event_type AS "eventType",
        event.payload,
        event.attempt_count AS "attemptCount",
        event.claimed_at AS "claimedAt"
    `);
  }

  private async publish(event: ClaimedOutboxEvent): Promise<void> {
    const realtimeEvent = this.toRealtimeEvent(event);
    if (!realtimeEvent) {
      await this.markPublished(event);
      return;
    }

    const isTicketCreation = realtimeEvent.name === 'ticket.created';
    const publishedToTenant = this.gateway.publishCompanyEvent(
      event.companyId,
      isTicketCreation ? realtimeEvent.name : 'tickets.changed',
      isTicketCreation ? realtimeEvent.payload : {},
    );
    const publishedToTicket = isTicketCreation || this.gateway.publishTicketEvent(
      event.companyId,
      realtimeEvent.ticketId,
      realtimeEvent.name,
      realtimeEvent.payload,
    );
    if (!publishedToTenant || !publishedToTicket) {
      await this.markForRetry(event);
      return;
    }
    await this.markPublished(event);
  }

  private async markPublished(event: ClaimedOutboxEvent): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PROCESSING', claimedAt: event.claimedAt },
      data: { status: 'PUBLISHED', claimedAt: null, publishedAt: new Date(), lastErrorCode: null },
    });
  }

  private async markForRetry(event: ClaimedOutboxEvent): Promise<void> {
    const permanentlyFailed = event.attemptCount >= MAX_ATTEMPTS;
    const delayMs = Math.min(60_000, 250 * 2 ** Math.min(event.attemptCount - 1, 8));
    await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PROCESSING', claimedAt: event.claimedAt },
      data: {
        status: permanentlyFailed ? 'FAILED' : 'PENDING',
        claimedAt: null,
        availableAt: new Date(Date.now() + delayMs),
        lastErrorCode: 'SOCKET_EVENT_PUBLISH_FAILED',
      },
    });
    if (permanentlyFailed) this.logger.error('Realtime outbox event reached its retry limit');
  }

  private toRealtimeEvent(event: ClaimedOutboxEvent): RealtimeEvent | undefined {
    const payload = isRecord(event.payload) ? event.payload : {};
    const ticketId = stringValue(payload.ticketId) ?? (event.aggregateType === 'ticket' ? event.aggregateId : undefined);
    if (!ticketId) return undefined;

    const eventNames: Record<string, string> = {
      'ticket.created': 'ticket.created',
      'message.received': 'message.received',
      'message.sent': 'message.sent',
      'message.status_changed': 'message.status_changed',
      'ticket.closed': 'ticket.closed',
      'ticket.status_changed': 'ticket.status_changed',
      'ticket.assigned': 'ticket.status_changed',
      'ticket.transferred': 'ticket.status_changed',
    };
    const name = eventNames[event.eventType];
    if (!name) return undefined;

    const messageId = stringValue(payload.messageId);
    return {
      name,
      ticketId,
      payload: { ticketId, ...(messageId ? { messageId } : {}) },
    };
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
