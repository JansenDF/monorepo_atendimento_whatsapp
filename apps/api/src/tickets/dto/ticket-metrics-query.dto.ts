import { IsDateString, IsOptional } from 'class-validator';

export class TicketMetricsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
