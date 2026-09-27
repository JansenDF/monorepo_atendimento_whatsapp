import { AI_EXECUTION_STATUS, AI_INTENT, AiIntent } from '../../src/ai/ai.types';
import { AiRepository } from '../../src/ai/ai.repository';
import { AiService } from '../../src/ai/ai.service';
import { IntentClassifier } from '../../src/ai/intent-classifier';
import { PromptManager } from '../../src/ai/prompt-manager';

describe('AiService confidence policy', () => {
  const companyId = '0bc78439-60ed-4c02-8a40-1ca73af06402';
  const ticketId = '44a65343-7d55-45da-b8da-54c52909a1d9';
  const messageId = 'b8e43375-7888-416a-a284-a5c743caa0c6';

  function setup(confidence: number, intent: AiIntent = AI_INTENT.FAQ, modelAnswer = 'Resposta da FAQ.') {
    const createExecution = jest.fn().mockResolvedValue({ id: 'execution-id' });
    const saveClassification = jest.fn().mockResolvedValue(undefined);
    const routeTicketToHuman = jest.fn().mockResolvedValue(undefined);
    const repository = {
      createExecution,
      findExecutionForMessage: jest.fn().mockResolvedValue(null),
      saveClassification,
      routeTicketToHuman,
    } as unknown as AiRepository;
    const prompts = { createForMessage: jest.fn().mockResolvedValue({
      instructions: 'instructions',
      userInput: 'question',
      persistedPrompt: 'full prompt',
      allowedAnswers: ['Resposta da FAQ.'],
    }) } as unknown as PromptManager;
    const classifier = {
      getProviderConfiguration: jest.fn().mockReturnValue({
        enabled: true, provider: 'OPENAI', model: 'support-model', endpoint: '', apiKey: '',
      }),
      classify: jest.fn().mockResolvedValue({
        classification: { intent, confidence, answer: modelAnswer },
        providerResponse: '{"intent":"FAQ"}',
      }),
    } as unknown as IntentClassifier;
    return {
      service: new AiService(repository, prompts, classifier),
      createExecution,
      saveClassification,
      routeTicketToHuman,
    };
  }

  const inbound = { companyId, ticketId, messageId, message: 'Qual é a política?' };

  it('allows an FAQ reply only above 85 percent and persists the audit data', async () => {
    const { service, createExecution, saveClassification } = setup(86);

    await expect(service.classifyInbound(inbound)).resolves.toEqual({
      action: 'AUTO_REPLY', executionId: 'execution-id', answer: 'Resposta da FAQ.',
    });

    expect(createExecution).toHaveBeenCalledWith(expect.objectContaining({
      companyId,
      ticketId,
      messageId,
      provider: 'OPENAI',
      model: 'support-model',
      prompt: 'full prompt',
    }));
    expect(saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      intent: AI_INTENT.FAQ,
      score: 86,
      response: '{"intent":"FAQ"}',
      status: AI_EXECUTION_STATUS.AUTO_REPLY_PENDING,
    }));
  });

  it('hands off at exactly 85 percent', async () => {
    const { service, saveClassification, routeTicketToHuman } = setup(85);

    await expect(service.classifyInbound(inbound)).resolves.toMatchObject({ action: 'HUMAN_HANDOFF' });
    expect(saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      score: 85, status: AI_EXECUTION_STATUS.HUMAN_HANDOFF,
    }));
    expect(routeTicketToHuman).toHaveBeenCalledWith(companyId, ticketId, messageId);
  });

  it('hands off even a high-confidence non-FAQ intent', async () => {
    const { service, saveClassification } = setup(99, AI_INTENT.BILLING);

    await expect(service.classifyInbound(inbound)).resolves.toMatchObject({ action: 'HUMAN_HANDOFF' });
    expect(saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      score: 99, intent: AI_INTENT.BILLING, status: AI_EXECUTION_STATUS.HUMAN_HANDOFF,
    }));
  });

  it('hands off when a high-confidence answer is not an exact company FAQ answer', async () => {
    const { service, saveClassification, routeTicketToHuman } = setup(99, AI_INTENT.FAQ, 'Resposta inventada.');

    await expect(service.classifyInbound(inbound)).resolves.toMatchObject({ action: 'HUMAN_HANDOFF' });
    expect(saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      score: 99,
      answer: '',
      status: AI_EXECUTION_STATUS.HUMAN_HANDOFF,
    }));
    expect(routeTicketToHuman).toHaveBeenCalledWith(companyId, ticketId, messageId);
  });
});
