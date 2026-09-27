import { IsIn } from 'class-validator';
import { WORKFLOW_TICKET_STATUSES, WorkflowTicketStatus } from '../ticket.types';

export class ChangeTicketStatusDto {
  @IsIn(WORKFLOW_TICKET_STATUSES)
  status!: WorkflowTicketStatus;
}
