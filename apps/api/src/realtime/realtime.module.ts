import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { ChatGateway } from './chat.gateway';
import { OutboxEventPublisher } from './outbox-event-publisher';

@Module({
  imports: [TicketsModule],
  providers: [ChatGateway, OutboxEventPublisher],
  exports: [ChatGateway],
})
export class RealtimeModule {}
