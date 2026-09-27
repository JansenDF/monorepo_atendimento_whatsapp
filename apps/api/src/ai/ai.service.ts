import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_REPOSITORY, AiRepository } from './ai.repository';
import { AiProviderError, IntentClassifier } from './intent-classifier';
import { PromptManager } from './prompt-manager';
import { AI_EXECUTION_STATUS, AI_INTENT, AiExecutionStatus, ClassificationResult, InboundAiDecision } from './ai.types';

const AUTO_REPLY_CONFIDENCE_THRESHOLD = 85;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_REPOSITORY) private readonly repository: AiRepository,
    private readonly prompts: PromptManager,
    private readonly classifier: IntentClassifier,
  ) {}

  async classifyInbound(input: {
    companyId: string;
    ticketId: string;
    messageId: string;
    message: string;
  }): Promise<InboundAiDecision> {
    const configuration = this.classifier.getProviderConfiguration();
    if (!configuration.enabled) {
      await this.routeTicketToHuman(input.companyId, input.ticketId, input.messageId);
      return { action: 'DISABLED' };
    }

    const existing = await this.repository.findExecutionForMessage(input.companyId, input.messageId);
    if (existing) return this.resolveExisting(input, existing);

    const managedPrompt = await this.prompts.createForMessage(input.companyId, input.message);
    let execution: { id: string };
    try {
      execution = await this.repository.createExecution({
        companyId: input.companyId,
        ticketId: input.ticketId,
        messageId: input.messageId,
        provider: configuration.provider,
        model: configuration.model,
        prompt: managedPrompt.persistedPrompt,
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const concurrent = await this.repository.findExecutionForMessage(input.companyId, input.messageId);
      if (!concurrent) throw error;
      return this.resolveExisting(input, concurrent);
    }

    let result: ClassificationResult;
    try {
      result = await this.classifier.classify(managedPrompt);
    } catch (error) {
      const errorCode = error instanceof AiProviderError ? error.code : 'AI_CLASSIFICATION_FAILED';
      await this.repository.markClassificationFailure({
        companyId: input.companyId,
        executionId: execution.id,
        ...(error instanceof AiProviderError && error.providerResponse
          ? { response: error.providerResponse }
          : {}),
        errorCode,
      });
      await this.repository.routeTicketToHuman(input.companyId, input.ticketId, input.messageId);
      this.logger.warn(`AI classification handed off to a human (${errorCode})`);
      return { action: 'HUMAN_HANDOFF', executionId: execution.id };
    }

    const { intent, confidence } = result.classification;
    const normalizedModelAnswer = this.normalizeAnswer(result.classification.answer);
    const answer = managedPrompt.allowedAnswers.find(
      (faqAnswer) => this.normalizeAnswer(faqAnswer) === normalizedModelAnswer,
    ) ?? '';
    const canReply = intent === AI_INTENT.FAQ && confidence > AUTO_REPLY_CONFIDENCE_THRESHOLD && answer.length > 0;
    await this.repository.saveClassification({
      companyId: input.companyId,
      executionId: execution.id,
      intent,
      score: confidence,
      response: result.providerResponse,
      answer,
      status: canReply ? AI_EXECUTION_STATUS.AUTO_REPLY_PENDING : AI_EXECUTION_STATUS.HUMAN_HANDOFF,
    });
    if (!canReply) await this.repository.routeTicketToHuman(input.companyId, input.ticketId, input.messageId);
    return canReply
      ? { action: 'AUTO_REPLY', executionId: execution.id, answer }
      : { action: 'HUMAN_HANDOFF', executionId: execution.id };
  }

  async recordAutoReplyFailure(companyId: string, executionId: string, errorCode: string): Promise<void> {
    await this.repository.recordAutoReplyFailure(companyId, executionId, errorCode);
  }

  async recordAutoReplySent(companyId: string, executionId: string): Promise<void> {
    await this.repository.recordAutoReplySent(companyId, executionId);
  }

  async claimAutoReply(companyId: string, executionId: string): Promise<boolean> {
    return this.repository.claimAutoReply(companyId, executionId);
  }

  private existingDecision(execution: {
    id: string;
    status: AiExecutionStatus;
    answer: string | null;
  }): InboundAiDecision {
    if (execution.status === AI_EXECUTION_STATUS.AUTO_REPLY_PENDING && execution.answer) {
      return { action: 'AUTO_REPLY', executionId: execution.id, answer: execution.answer };
    }
    if (execution.status === AI_EXECUTION_STATUS.AUTO_REPLIED) {
      return { action: 'ALREADY_HANDLED', executionId: execution.id };
    }
    if (
      execution.status === AI_EXECUTION_STATUS.PROCESSING ||
      execution.status === AI_EXECUTION_STATUS.AUTO_REPLY_SENDING
    ) {
      return { action: 'ALREADY_HANDLED', executionId: execution.id };
    }
    return { action: 'HUMAN_HANDOFF', executionId: execution.id };
  }

  private async resolveExisting(
    input: { companyId: string; ticketId: string; messageId: string },
    execution: { id: string; status: AiExecutionStatus; answer: string | null; updatedAt: Date },
  ): Promise<InboundAiDecision> {
    const isInFlight = execution.status === AI_EXECUTION_STATUS.PROCESSING ||
      execution.status === AI_EXECUTION_STATUS.AUTO_REPLY_SENDING;
    if (isInFlight && Date.now() - execution.updatedAt.getTime() >= 120_000) {
      const abandoned = await this.repository.markAbandonedExecution(input.companyId, execution.id);
      if (abandoned) {
        await this.routeTicketToHuman(input.companyId, input.ticketId, input.messageId);
        return { action: 'HUMAN_HANDOFF', executionId: execution.id };
      }
      const latest = await this.repository.findExecutionForMessage(input.companyId, input.messageId);
      if (latest && latest.status !== execution.status) return this.resolveExisting(input, latest);
    }

    const decision = this.existingDecision(execution);
    if (decision.action === 'HUMAN_HANDOFF') {
      await this.routeTicketToHuman(input.companyId, input.ticketId, input.messageId);
    }
    return decision;
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private async routeTicketToHuman(companyId: string, ticketId: string, messageId: string): Promise<void> {
    await this.repository.routeTicketToHuman(companyId, ticketId, messageId);
  }

  private normalizeAnswer(answer: string): string {
    return answer.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
  }
}
