export const AI_PROVIDERS = ['OPENAI', 'AZURE_OPENAI'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_INTENT = {
  FAQ: 'FAQ',
  ORDER_STATUS: 'ORDER_STATUS',
  BILLING: 'BILLING',
  COMPLAINT: 'COMPLAINT',
  SALES: 'SALES',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF',
  OTHER: 'OTHER',
} as const;
export type AiIntent = (typeof AI_INTENT)[keyof typeof AI_INTENT];
export const AI_INTENTS: AiIntent[] = Object.values(AI_INTENT);

export const AI_EXECUTION_STATUS = {
  PROCESSING: 'PROCESSING',
  AUTO_REPLY_PENDING: 'AUTO_REPLY_PENDING',
  AUTO_REPLY_SENDING: 'AUTO_REPLY_SENDING',
  AUTO_REPLIED: 'AUTO_REPLIED',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF',
  FAILED: 'FAILED',
} as const;
export type AiExecutionStatus = (typeof AI_EXECUTION_STATUS)[keyof typeof AI_EXECUTION_STATUS];

export interface CompanyFaq {
  question: string;
  answer: string;
}

export interface ManagedPrompt {
  instructions: string;
  userInput: string;
  persistedPrompt: string;
  allowedAnswers: string[];
}

export interface ClassifiedIntent {
  intent: AiIntent;
  confidence: number;
  answer: string;
}

export interface ClassificationResult {
  classification: ClassifiedIntent;
  providerResponse: string;
}

export interface AiProviderConfiguration {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  endpoint: string;
  apiKey: string;
}

export type InboundAiDecision =
  | { action: 'AUTO_REPLY'; executionId: string; answer: string }
  | { action: 'HUMAN_HANDOFF'; executionId: string }
  | { action: 'ALREADY_HANDLED'; executionId: string }
  | { action: 'DISABLED' };
