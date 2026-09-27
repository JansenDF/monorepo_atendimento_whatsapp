import { Module } from '@nestjs/common';
import { JwtAccessGuard } from '../common/auth/jwt-access.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { AiController } from './ai.controller';
import { AiFaqService } from './ai-faq.service';
import { AI_REPOSITORY } from './ai.repository';
import { AiService } from './ai.service';
import { IntentClassifier } from './intent-classifier';
import { PrismaAiRepository } from './prisma-ai.repository';
import { PromptManager } from './prompt-manager';

@Module({
  controllers: [AiController],
  providers: [
    AiFaqService,
    AiService,
    IntentClassifier,
    PromptManager,
    PrismaAiRepository,
    { provide: AI_REPOSITORY, useExisting: PrismaAiRepository },
    JwtAccessGuard,
    RolesGuard,
  ],
  exports: [AiService],
})
export class AiModule {}
