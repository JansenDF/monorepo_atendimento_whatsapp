import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { AI_REPOSITORY, AiRepository } from './ai.repository';
import { CreateAiFaqDto } from './dto/create-ai-faq.dto';
import { UpdateAiFaqDto } from './dto/update-ai-faq.dto';

@Injectable()
export class AiFaqService {
  constructor(@Inject(AI_REPOSITORY) private readonly repository: AiRepository) {}

  list(actor: AuthenticatedActor) {
    return this.repository.listFaqs(actor.companyId);
  }

  create(actor: AuthenticatedActor, input: CreateAiFaqDto) {
    return this.repository.createFaq({
      companyId: actor.companyId,
      question: input.question,
      answer: input.answer,
      isActive: input.isActive ?? true,
    });
  }

  async findById(actor: AuthenticatedActor, id: string) {
    const faq = await this.repository.findFaq(actor.companyId, id);
    if (!faq) throw new NotFoundException('FAQ not found');
    return faq;
  }

  async update(actor: AuthenticatedActor, id: string, input: UpdateAiFaqDto) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one FAQ field must be provided');
    }
    const faq = await this.repository.updateFaq(actor.companyId, id, input);
    if (!faq) throw new NotFoundException('FAQ not found');
    return faq;
  }

  async remove(actor: AuthenticatedActor, id: string): Promise<{ id: string; isActive: false }> {
    const changed = await this.repository.deactivateFaq(actor.companyId, id);
    if (!changed) throw new NotFoundException('FAQ not found');
    return { id, isActive: false };
  }
}
