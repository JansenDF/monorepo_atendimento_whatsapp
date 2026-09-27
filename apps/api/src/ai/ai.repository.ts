import { AiExecutionStatus, AiIntent, AiProvider } from './ai.types';

export const AI_REPOSITORY = Symbol('AI_REPOSITORY');

export interface AiFaqRecord {
  id: string;
  companyId: string;
  question: string;
  answer: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiExecutionRecord {
  id: string;
  status: AiExecutionStatus;
  answer: string | null;
  updatedAt: Date;
}

export interface CreateAiExecution {
  companyId: string;
  ticketId: string;
  messageId: string;
  provider: AiProvider;
  model: string;
  prompt: string;
}

export interface SaveAiClassification {
  companyId: string;
  executionId: string;
  intent: AiIntent;
  score: number;
  response: string;
  answer: string;
  status: AiExecutionStatus;
}

export interface AiRepository {
  findExecutionForMessage(companyId: string, messageId: string): Promise<AiExecutionRecord | null>;
  createExecution(input: CreateAiExecution): Promise<{ id: string }>;
  saveClassification(input: SaveAiClassification): Promise<void>;
  markClassificationFailure(input: {
    companyId: string;
    executionId: string;
    errorCode: string;
    response?: string;
  }): Promise<void>;
  markAbandonedExecution(companyId: string, executionId: string): Promise<boolean>;
  claimAutoReply(companyId: string, executionId: string): Promise<boolean>;
  recordAutoReplyFailure(companyId: string, executionId: string, errorCode: string): Promise<void>;
  recordAutoReplySent(companyId: string, executionId: string): Promise<void>;
  routeTicketToHuman(companyId: string, ticketId: string, messageId: string): Promise<void>;
  listActiveFaqs(companyId: string, limit: number): Promise<Array<{ question: string; answer: string }>>;
  listFaqs(companyId: string): Promise<AiFaqRecord[]>;
  findFaq(companyId: string, id: string): Promise<AiFaqRecord | null>;
  createFaq(input: { companyId: string; question: string; answer: string; isActive: boolean }): Promise<AiFaqRecord>;
  updateFaq(
    companyId: string,
    id: string,
    input: Partial<Pick<AiFaqRecord, 'question' | 'answer' | 'isActive'>>,
  ): Promise<AiFaqRecord | null>;
  deactivateFaq(companyId: string, id: string): Promise<boolean>;
}
