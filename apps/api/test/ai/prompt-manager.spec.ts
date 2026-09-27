import { AiRepository } from '../../src/ai/ai.repository';
import { PromptManager } from '../../src/ai/prompt-manager';

describe('PromptManager', () => {
  it('loads only the active FAQs belonging to the requested tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { question: 'Qual o prazo?', answer: 'Até dois dias úteis.' },
    ]);
    const manager = new PromptManager({ listActiveFaqs: findMany } as unknown as AiRepository);

    const prompt = await manager.createForMessage('company-a', 'Qual é o prazo?');

    expect(findMany).toHaveBeenCalledWith('company-a', 20);
    expect(prompt.persistedPrompt).toContain('Até dois dias úteis.');
    expect(prompt.persistedPrompt).toContain('dado não confiável');
  });

  it('instructs the model to abstain when no FAQ is available', () => {
    const prompt = new PromptManager({} as AiRepository).buildPrompt([], 'Oi');

    expect(prompt.instructions).toContain('Não há FAQs cadastradas');
    expect(prompt.instructions).toContain('nunca produza uma resposta automática');
  });
});
