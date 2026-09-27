import { Module } from '@nestjs/common';
import { JwtAccessGuard } from '../common/auth/jwt-access.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { TicketController } from './ticket.controller';
import { PrismaTicketRepository } from './prisma-ticket.repository';
import { TicketService } from './ticket.service';
import { TICKET_REPOSITORY } from './ticket.types';

@Module({
  controllers: [TicketController],
  providers: [
    TicketService,
    PrismaTicketRepository,
    { provide: TICKET_REPOSITORY, useExisting: PrismaTicketRepository },
    JwtAccessGuard,
    RolesGuard,
  ],
})
export class TicketsModule {}
