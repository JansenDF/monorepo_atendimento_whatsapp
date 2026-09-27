import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderConfiguration, AI_INTENTS, AiIntent, AiProvider, ClassificationResult, ManagedPrompt } from './ai.types';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARACTERS = 16_000;
const INTENTS = new Set<string>(AI_INTENTS);

export class AiProviderError extends Error {
  constructor(
    readonly code: string,
    readonly providerResponse?: string,
  ) {
    super(code);
    this.name = 'AiProviderError';
  }
}

@Injectable()
export class IntentClassifier {
  constructor(private readonly config: ConfigService) {}

  getProviderConfiguration(): AiProviderConfiguration {
    const provider = this.config.get<'OPENAI' | 'AZURE_OPENAI'>('AI_PROVIDER') ?? 'OPENAI';
    if (provider === 'AZURE_OPENAI') {
      const endpoint = (this.config.get<string>('AZURE_OPENAI_ENDPOINT') ?? '').replace(/\/+$/, '');
      const versionedEndpoint = endpoint.endsWith('/openai/v1') ? endpoint : `${endpoint}/openai/v1`;
      return {
        enabled: this.config.get<boolean>('AI_ENABLED') === true,
        provider: 'AZURE_OPENAI',
        model: this.config.get<string>('AZURE_OPENAI_DEPLOYMENT') ?? '',
        endpoint: `${versionedEndpoint}/responses`,
        apiKey: this.config.get<string>('AZURE_OPENAI_API_KEY') ?? '',
      };
    }
    return {
      enabled: this.config.get<boolean>('AI_ENABLED') === true,
      provider: 'OPENAI',
      model: this.config.get<string>('OPENAI_MODEL') ?? '',
      endpoint: 'https://api.openai.com/v1/responses',
      apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '',
    };
  }

  async classify(prompt: ManagedPrompt): Promise<ClassificationResult> {
    const configuration = this.getProviderConfiguration();
    const payload = {
      model: configuration.model,
      instructions: prompt.instructions,
      input: prompt.userInput,
      max_output_tokens: 500,
      text: {
        format: {
          type: 'json_schema',
          name: 'customer_support_intent',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              intent: { type: 'string', enum: AI_INTENTS },
              confidence: { type: 'integer', minimum: 0, maximum: 100 },
              answer: { type: 'string' },
            },
            required: ['intent', 'confidence', 'answer'],
            additionalProperties: false,
          },
        },
      },
    };

    let rawResponse: string | undefined;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(configuration.endpoint, {
          method: 'POST',
          headers: {
            ...(configuration.provider === 'AZURE_OPENAI'
              ? { 'api-key': configuration.apiKey }
              : { authorization: `Bearer ${configuration.apiKey}` }),
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch {
        if (attempt < 2) {
          await this.delay(250);
          continue;
        }
        throw new AiProviderError('AI_PROVIDER_UNAVAILABLE');
      }

      rawResponse = await response.text();
      if (!response.ok) {
        const error = new AiProviderError(
          response.status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : 'AI_PROVIDER_REQUEST_FAILED',
        );
        if (attempt < 2 && this.isRetryable(response.status)) {
          await this.delay(this.retryDelay(response.headers.get('retry-after')));
          continue;
        }
        throw error;
      }
      if (rawResponse.length > MAX_RESPONSE_CHARACTERS) {
        throw new AiProviderError('AI_PROVIDER_RESPONSE_TOO_LARGE');
      }
      break;
    }

    if (!rawResponse) throw new AiProviderError('AI_PROVIDER_EMPTY_RESPONSE');
    let providerResponse: string;
    try {
      providerResponse = this.extractOutputText(JSON.parse(rawResponse) as unknown);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError('AI_PROVIDER_INVALID_RESPONSE');
    }
    let value: unknown;
    try {
      value = JSON.parse(providerResponse) as unknown;
    } catch {
      throw new AiProviderError('AI_CLASSIFICATION_INVALID_JSON', providerResponse);
    }

    if (!this.isRecord(value) ||
      typeof value.intent !== 'string' || !INTENTS.has(value.intent) ||
      typeof value.confidence !== 'number' || !Number.isInteger(value.confidence) ||
      value.confidence < 0 || value.confidence > 100 ||
      typeof value.answer !== 'string' || value.answer.length > 4000) {
      throw new AiProviderError('AI_CLASSIFICATION_SCHEMA_INVALID', providerResponse);
    }
    return {
      classification: {
        intent: value.intent as AiIntent,
        confidence: value.confidence,
        answer: value.answer.trim(),
      },
      providerResponse,
    };
  }

  private extractOutputText(value: unknown): string {
    if (!this.isRecord(value)) throw new AiProviderError('AI_PROVIDER_INVALID_RESPONSE');
    if (typeof value.output_text === 'string') return value.output_text;
    if (!Array.isArray(value.output)) throw new AiProviderError('AI_PROVIDER_EMPTY_RESPONSE');
    const chunks: string[] = [];
    for (const item of value.output) {
      if (!this.isRecord(item) || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (this.isRecord(content) && content.type === 'output_text' && typeof content.text === 'string') {
          chunks.push(content.text);
        }
      }
    }
    const result = chunks.join('\n').trim();
    if (!result) throw new AiProviderError('AI_PROVIDER_EMPTY_RESPONSE');
    return result;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isRetryable(status: number): boolean {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  private retryDelay(retryAfter: string | null): number {
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(2_000, seconds * 1_000) : 500;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
