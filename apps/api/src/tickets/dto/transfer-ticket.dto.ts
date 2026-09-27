import { IsOptional, IsUUID } from 'class-validator';

export class TransferTicketDto {
  @IsUUID()
  departmentId!: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
