import { ConfigService } from '@nestjs/config';
import { IntentClassifier } from '../../src/ai/intent-classifier';

describe('IntentClassifier', () => {
  const modelOutput = JSON.stringify({ intent: 'FAQ', confidence: 92, answer: 'Até dois dias úteis.' });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    {
      provider: 'OPENAI',
      values: { AI_ENABLED: true, AI_PROVIDER: 'OPENAI', OPENAI_MODEL: 'support-model', OPENAI_API_KEY: 'openai-secret' },
      expectedUrl: 'https://api.openai.com/v1/responses',
      expectedAuthHeader: 'authorization',
    },
    {
      provider: 'AZURE_OPENAI',
      values: {
        AI_ENABLED: true,
        AI_PROVIDER: 'AZURE_OPENAI',
        AZURE_OPENAI_ENDPOINT: 'https://contoso.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'support-deployment',
        AZURE_OPENAI_API_KEY: 'azure-secret',
      },
      expectedUrl: 'https://contoso.openai.azure.com/openai/v1/responses',
      expectedAuthHeader: 'api-key',
    },
  ])('uses the configured $provider Responses API endpoint', async ({ values, expectedUrl, expectedAuthHeader }) => {
    const config = {
      get: (key: string) => values[key as keyof typeof values],
    } as ConfigService;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: 'output_text', text: modelOutput }] }],
    }), { status: 200 }));
    const classifier = new IntentClassifier(config);

    const result = await classifier.classify({
      instructions: 'Classifique com base nas FAQs.',
      userInput: 'Qual é o prazo?',
      persistedPrompt: 'prompt auditável',
      allowedAnswers: ['Até dois dias úteis.'],
    });

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ [expectedAuthHeader]: expect.any(String) }),
    }));
    expect(result.classification).toEqual({
      intent: 'FAQ',
      confidence: 92,
      answer: 'Até dois dias úteis.',
    });
    expect(result.providerResponse).toBe(modelOutput);
  });

  it('rejects scores outside the supported percentage range', async () => {
    const config = {
      get: (key: string) => ({
        AI_ENABLED: true,
        AI_PROVIDER: 'OPENAI',
        OPENAI_MODEL: 'support-model',
        OPENAI_API_KEY: 'openai-secret',
      })[key as 'AI_ENABLED' | 'AI_PROVIDER' | 'OPENAI_MODEL' | 'OPENAI_API_KEY'],
    } as ConfigService;
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ intent: 'FAQ', confidence: 101, answer: 'x' }) }] }],
    }), { status: 200 }));

    await expect(new IntentClassifier(config).classify({
      instructions: 'instructions', userInput: 'message', persistedPrompt: 'prompt', allowedAnswers: ['x'],
    })).rejects.toMatchObject({ code: 'AI_CLASSIFICATION_SCHEMA_INVALID' });
  });
});
