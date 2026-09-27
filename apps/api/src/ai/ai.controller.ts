import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAccessGuard } from '../common/auth/jwt-access.guard';
import { RequireRoles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { AiFaqService } from './ai-faq.service';
import { CreateAiFaqDto } from './dto/create-ai-faq.dto';
import { UpdateAiFaqDto } from './dto/update-ai-faq.dto';

@Controller('ai/faqs')
@UseGuards(JwtAccessGuard, RolesGuard)
@RequireRoles('ADMIN', 'SUPERVISOR')
export class AiController {
  constructor(private readonly faqs: AiFaqService) {}

  @Get()
  list(@CurrentActor() actor: AuthenticatedActor) {
    return this.faqs.list(actor);
  }

  @Post()
  create(@CurrentActor() actor: AuthenticatedActor, @Body() input: CreateAiFaqDto) {
    return this.faqs.create(actor, input);
  }

  @Get(':faqId')
  findById(@CurrentActor() actor: AuthenticatedActor, @Param('faqId', ParseUUIDPipe) faqId: string) {
    return this.faqs.findById(actor, faqId);
  }

  @Patch(':faqId')
  update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('faqId', ParseUUIDPipe) faqId: string,
    @Body() input: UpdateAiFaqDto,
  ) {
    return this.faqs.update(actor, faqId, input);
  }

  @Delete(':faqId')
  remove(@CurrentActor() actor: AuthenticatedActor, @Param('faqId', ParseUUIDPipe) faqId: string) {
    return this.faqs.remove(actor, faqId);
  }
}
