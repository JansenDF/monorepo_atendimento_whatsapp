import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { JwtAccessGuard } from '../common/auth/jwt-access.guard';
import { RequireRoles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { ChangeTicketStatusDto } from './dto/change-ticket-status.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { TicketMetricsQueryDto } from './dto/ticket-metrics-query.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';
import { TicketService } from './ticket.service';

@Controller('tickets')
@UseGuards(JwtAccessGuard, RolesGuard)
export class TicketController {
  constructor(private readonly tickets: TicketService) {}

  @Get()
  @RequireRoles('ADMIN', 'SUPERVISOR', 'AGENT')
  list(@CurrentActor() actor: AuthenticatedActor, @Query() query: ListTicketsQueryDto) {
    return this.tickets.list(actor, query);
  }

  @Get('metrics')
  @RequireRoles('ADMIN', 'SUPERVISOR')
  metrics(@CurrentActor() actor: AuthenticatedActor, @Query() query: TicketMetricsQueryDto) {
    return this.tickets.metrics(actor, query.from, query.to);
  }

  @Get(':ticketId')
  @RequireRoles('ADMIN', 'SUPERVISOR', 'AGENT')
  findById(@CurrentActor() actor: AuthenticatedActor, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.tickets.findById(actor, ticketId);
  }

  @Patch(':ticketId/status')
  @RequireRoles('ADMIN', 'SUPERVISOR', 'AGENT')
  changeStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() body: ChangeTicketStatusDto,
  ) {
    return this.tickets.changeStatus(actor, ticketId, body.status);
  }

  @Post(':ticketId/close')
  @RequireRoles('ADMIN', 'SUPERVISOR', 'AGENT')
  close(@CurrentActor() actor: AuthenticatedActor, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.tickets.close(actor, ticketId);
  }

  @Post(':ticketId/reopen')
  @RequireRoles('ADMIN', 'SUPERVISOR', 'AGENT')
  reopen(@CurrentActor() actor: AuthenticatedActor, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.tickets.reopen(actor, ticketId);
  }

  @Post(':ticketId/assume')
  @RequireRoles('AGENT')
  assume(@CurrentActor() actor: AuthenticatedActor, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.tickets.assume(actor, ticketId);
  }

  @Post(':ticketId/transfer')
  @RequireRoles('ADMIN', 'SUPERVISOR')
  transfer(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() body: TransferTicketDto,
  ) {
    return this.tickets.transfer(actor, ticketId, body.departmentId, body.assigneeId);
  }
}
