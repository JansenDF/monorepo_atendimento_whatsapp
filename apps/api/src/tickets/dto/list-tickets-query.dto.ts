import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { WORKFLOW_TICKET_STATUSES, WorkflowTicketStatus } from '../ticket.types';

export class ListTicketsQueryDto {
  @IsOptional()
  @IsIn(WORKFLOW_TICKET_STATUSES)
  status?: WorkflowTicketStatus;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
