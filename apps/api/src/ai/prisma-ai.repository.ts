import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  AiFaqRecord,
  AiRepository,
  CreateAiExecution,
  SaveAiClassification,
} from './ai.repository';
import { AI_EXECUTION_STATUS } from './ai.types';

@Injectable()
export class PrismaAiRepository implements AiRepository {
  constructor(private readonly prisma: PrismaService) {}

  findExecutionForMessage(companyId: string, messageId: string) {
    return this.prisma.aiExecution.findUnique({
      where: { companyId_messageId: { companyId, messageId } },
      select: { id: true, status: true, answer: true, updatedAt: true },
    });
  }

  createExecution(input: CreateAiExecution): Promise<{ id: string }> {
    return this.prisma.aiExecution.create({
      data: { ...input, status: AI_EXECUTION_STATUS.PROCESSING },
      select: { id: true },
    });
  }

  async saveClassification(input: SaveAiClassification): Promise<void> {
    await this.prisma.aiExecution.update({
      where: { id_companyId: { id: input.executionId, companyId: input.companyId } },
      data: {
        intent: input.intent,
        score: input.score,
        response: input.response,
        answer: input.answer,
        status: input.status,
        errorCode: null,
      },
    });
  }

  async markClassificationFailure(input: {
    companyId: string;
    executionId: string;
    errorCode: string;
    response?: string;
  }): Promise<void> {
    await this.prisma.aiExecution.update({
      where: { id_companyId: { id: input.executionId, companyId: input.companyId } },
      data: {
        ...(input.response ? { response: input.response } : {}),
        status: AI_EXECUTION_STATUS.HUMAN_HANDOFF,
        errorCode: input.errorCode.slice(0, 100),
      },
    });
  }

  async markAbandonedExecution(companyId: string, executionId: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - 120_000);
    const changed = await this.prisma.aiExecution.updateMany({
      where: {
        id: executionId,
        companyId,
        status: { in: [AI_EXECUTION_STATUS.PROCESSING, AI_EXECUTION_STATUS.AUTO_REPLY_SENDING] },
        updatedAt: { lt: staleBefore },
      },
      data: { status: AI_EXECUTION_STATUS.HUMAN_HANDOFF, errorCode: 'AI_EXECUTION_ABANDONED' },
    });
    return changed.count === 1;
  }

  async claimAutoReply(companyId: string, executionId: string): Promise<boolean> {
    const claim = await this.prisma.aiExecution.updateMany({
      where: { id: executionId, companyId, status: AI_EXECUTION_STATUS.AUTO_REPLY_PENDING },
      data: { status: AI_EXECUTION_STATUS.AUTO_REPLY_SENDING },
    });
    return claim.count === 1;
  }

  async recordAutoReplyFailure(companyId: string, executionId: string, errorCode: string): Promise<void> {
    await this.prisma.aiExecution.updateMany({
      where: { id: executionId, companyId, status: AI_EXECUTION_STATUS.AUTO_REPLY_SENDING },
      data: { status: AI_EXECUTION_STATUS.HUMAN_HANDOFF, errorCode: errorCode.slice(0, 100) },
    });
  }

  async recordAutoReplySent(companyId: string, executionId: string): Promise<void> {
    await this.prisma.aiExecution.updateMany({
      where: { id: executionId, companyId, status: AI_EXECUTION_STATUS.AUTO_REPLY_SENDING },
      data: { status: AI_EXECUTION_STATUS.AUTO_REPLIED, errorCode: null },
    });
  }

  async routeTicketToHuman(companyId: string, ticketId: string, messageId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.ticket.updateMany({
        where: { id: ticketId, companyId, status: 'BOT' },
        data: { status: 'OPEN' },
      });
      if (changed.count !== 1) return;
      await transaction.outboxEvent.create({
        data: {
          companyId,
          aggregateType: 'ticket',
          aggregateId: ticketId,
          eventType: 'ticket.status_changed',
          idempotencyKey: `ticket.ai_handoff:${messageId}`,
          payload: {
            ticketId,
            previousStatus: 'BOT',
            status: 'OPEN',
            source: 'ai_confidence_handoff',
          },
        },
      });
    });
  }

  listActiveFaqs(companyId: string, limit: number) {
    return this.prisma.aiFaq.findMany({
      where: { companyId, isActive: true },
      select: { question: true, answer: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
  }

  listFaqs(companyId: string): Promise<AiFaqRecord[]> {
    return this.prisma.aiFaq.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findFaq(companyId: string, id: string): Promise<AiFaqRecord | null> {
    return this.prisma.aiFaq.findUnique({ where: { id_companyId: { id, companyId } } });
  }

  createFaq(input: { companyId: string; question: string; answer: string; isActive: boolean }): Promise<AiFaqRecord> {
    return this.prisma.aiFaq.create({ data: input });
  }

  async updateFaq(
    companyId: string,
    id: string,
    input: Partial<Pick<AiFaqRecord, 'question' | 'answer' | 'isActive'>>,
  ): Promise<AiFaqRecord | null> {
    const changed = await this.prisma.aiFaq.updateMany({
      where: { id, companyId },
      data: input as Prisma.AiFaqUpdateManyMutationInput,
    });
    return changed.count === 1 ? this.findFaq(companyId, id) : null;
  }

  async deactivateFaq(companyId: string, id: string): Promise<boolean> {
    const changed = await this.prisma.aiFaq.updateMany({
      where: { id, companyId },
      data: { isActive: false },
    });
    return changed.count === 1;
  }
}
