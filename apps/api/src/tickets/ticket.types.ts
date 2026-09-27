import { AuthenticatedActor } from '../common/auth/authenticated-actor';

export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');

export const WORKFLOW_TICKET_STATUSES = [
  'OPEN',
  'PENDING',
  'WAITING_CUSTOMER',
  'CLOSED',
] as const;

export type WorkflowTicketStatus = (typeof WORKFLOW_TICKET_STATUSES)[number];

export interface TicketListOptions {
  companyId: string;
  actor: AuthenticatedActor;
  departmentIds: string[];
  status?: WorkflowTicketStatus;
  assigneeId?: string;
  departmentId?: string;
  page: number;
  pageSize: number;
}

export interface TicketListResult {
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketMetrics {
  period: { from: string; to: string };
  averageFirstResponseSeconds: number | null;
  averageHandlingSeconds: number | null;
  ticketsByAgent: Array<{ agentId: string | null; agentName: string | null; count: number }>;
  ticketsByDepartment: Array<{ departmentId: string | null; departmentName: string | null; count: number }>;
}

export interface TicketMutationSnapshot {
  id: string;
  companyId: string;
  status: string;
  assigneeId: string | null;
  departmentId: string | null;
}

export interface TicketRecord extends TicketMutationSnapshot {
  customerId: string;
  contactId: string | null;
  channel: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface TicketRepository {
  list(options: TicketListOptions): Promise<TicketListResult>;
  findById(companyId: string, ticketId: string): Promise<TicketRecord | null>;
  isActiveDepartment(companyId: string, departmentId: string): Promise<boolean>;
  findUserForAssignment(companyId: string, userId: string, departmentId: string): Promise<boolean>;
  transition(input: {
    ticket: TicketMutationSnapshot;
    actorId: string;
    nextStatus: WorkflowTicketStatus;
    closedAt: Date | null;
  }): Promise<boolean>;
  assume(input: { ticket: TicketMutationSnapshot; actorId: string }): Promise<boolean>;
  transfer(input: {
    ticket: TicketMutationSnapshot;
    actorId: string;
    departmentId: string;
    assigneeId: string | null;
  }): Promise<boolean>;
  metrics(input: { companyId: string; from: Date; to: Date }): Promise<Omit<TicketMetrics, 'period'>>;
}
