import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedActor } from '../common/auth/authenticated-actor';
import {
  TicketListOptions,
  TicketListResult,
  TicketMetrics,
  TicketMutationSnapshot,
  TicketRecord,
  TicketRepository,
  TICKET_REPOSITORY,
  WorkflowTicketStatus,
} from './ticket.types';

const MAX_METRICS_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const PRIVILEGED_ROLES = new Set(['ADMIN', 'SUPERVISOR']);
const ALLOWED_TRANSITIONS: Record<string, readonly WorkflowTicketStatus[]> = {
  OPEN: ['OPEN', 'PENDING', 'WAITING_CUSTOMER', 'CLOSED'],
  PENDING: ['OPEN', 'PENDING', 'WAITING_CUSTOMER', 'CLOSED'],
  WAITING_CUSTOMER: ['OPEN', 'PENDING', 'WAITING_CUSTOMER', 'CLOSED'],
  CLOSED: ['OPEN', 'CLOSED'],
  // Legacy states remain in the database for compatibility with earlier schema versions.
  BOT: ['OPEN', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED'],
};

@Injectable()
export class TicketService {
  constructor(@Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository) {}

  async list(actor: AuthenticatedActor, query: Omit<TicketListOptions, 'companyId' | 'actor' | 'departmentIds'>): Promise<TicketListResult> {
    if (!this.isPrivileged(actor) && actor.roles.includes('AGENT')) {
      if (query.assigneeId && query.assigneeId !== actor.userId) {
        throw new ForbiddenException('Agents can only filter tickets assigned to themselves');
      }
      if (query.departmentId && !actor.departmentIds.includes(query.departmentId)) {
        throw new ForbiddenException('The agent is not a member of the requested department');
      }
    }

    return this.tickets.list({
      ...query,
      companyId: actor.companyId,
      actor,
      departmentIds: actor.departmentIds,
    });
  }

  async findById(actor: AuthenticatedActor, ticketId: string): Promise<Record<string, unknown>> {
    const ticket = await this.getTicket(actor.companyId, ticketId);
    this.assertCanAccess(actor, ticket);
    return ticket as unknown as Record<string, unknown>;
  }

  async changeStatus(
    actor: AuthenticatedActor,
    ticketId: string,
    nextStatus: WorkflowTicketStatus,
  ): Promise<Record<string, unknown>> {
    const ticket = await this.getTicket(actor.companyId, ticketId);
    this.assertCanAccess(actor, ticket);
    const allowed = ALLOWED_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new ConflictException(`Cannot transition ticket from ${ticket.status} to ${nextStatus}`);
    }
    if (ticket.status === nextStatus) return ticket as unknown as Record<string, unknown>;

    const changed = await this.tickets.transition({
      ticket,
      actorId: actor.userId,
      nextStatus,
      closedAt: nextStatus === 'CLOSED' ? new Date() : null,
    });
    if (!changed) throw new ConflictException('Ticket changed while this operation was in progress');
    return (await this.getTicket(actor.companyId, ticketId)) as unknown as Record<string, unknown>;
  }

  async close(actor: AuthenticatedActor, ticketId: string): Promise<Record<string, unknown>> {
    return this.changeStatus(actor, ticketId, 'CLOSED');
  }

  async reopen(actor: AuthenticatedActor, ticketId: string): Promise<Record<string, unknown>> {
    const ticket = await this.getTicket(actor.companyId, ticketId);
    this.assertCanAccess(actor, ticket);
    if (ticket.status !== 'CLOSED') throw new ConflictException('Only closed tickets can be reopened');
    return this.changeStatus(actor, ticketId, 'OPEN');
  }

  async assume(actor: AuthenticatedActor, ticketId: string): Promise<Record<string, unknown>> {
    const ticket = await this.getTicket(actor.companyId, ticketId);
    this.assertCanAccess(actor, ticket);
    if (ticket.status === 'CLOSED') throw new ConflictException('Closed tickets cannot be assumed');
    if (!actor.roles.includes('AGENT')) throw new ForbiddenException('Only agents can assume tickets');
    if (ticket.assigneeId === actor.userId) return ticket as unknown as Record<string, unknown>;
    if (ticket.assigneeId) throw new ConflictException('Ticket is already assigned to another agent');
    if (ticket.departmentId && !actor.departmentIds.includes(ticket.departmentId)) {
      throw new ForbiddenException('The agent is not a member of this ticket department');
    }

    const changed = await this.tickets.assume({ ticket, actorId: actor.userId });
    if (!changed) throw new ConflictException('Ticket was assigned while this operation was in progress');
    return (await this.getTicket(actor.companyId, ticketId)) as unknown as Record<string, unknown>;
  }

  async transfer(
    actor: AuthenticatedActor,
    ticketId: string,
    departmentId: string,
    assigneeId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertPrivileged(actor);
    const ticket = await this.getTicket(actor.companyId, ticketId);
    if (ticket.status === 'CLOSED') throw new ConflictException('Closed tickets cannot be transferred');

    if (!(await this.tickets.isActiveDepartment(actor.companyId, departmentId))) {
      throw new BadRequestException('Target department is not active in this company');
    }

    const nextAssigneeId = assigneeId ?? null;
    if (nextAssigneeId) {
      const eligible = await this.tickets.findUserForAssignment(actor.companyId, nextAssigneeId, departmentId);
      if (!eligible) throw new BadRequestException('Assignee must be an active agent in the target department');
    }

    const changed = await this.tickets.transfer({
      ticket,
      actorId: actor.userId,
      departmentId,
      assigneeId: nextAssigneeId,
    });
    if (!changed) throw new ConflictException('Ticket changed while this operation was in progress');
    return (await this.getTicket(actor.companyId, ticketId)) as unknown as Record<string, unknown>;
  }

  async metrics(actor: AuthenticatedActor, from?: string, to?: string): Promise<TicketMetrics> {
    this.assertPrivileged(actor);
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      throw new BadRequestException('Metrics period must have a valid start before its end');
    }
    if (end.getTime() - start.getTime() > MAX_METRICS_RANGE_MS) {
      throw new BadRequestException('Metrics period cannot exceed 366 days');
    }

    const metrics = await this.tickets.metrics({ companyId: actor.companyId, from: start, to: end });
    return { period: { from: start.toISOString(), to: end.toISOString() }, ...metrics };
  }

  private async getTicket(companyId: string, ticketId: string): Promise<TicketRecord> {
    const ticket = await this.tickets.findById(companyId, ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private assertCanAccess(actor: AuthenticatedActor, ticket: TicketMutationSnapshot): void {
    if (this.isPrivileged(actor)) return;
    if (!actor.roles.includes('AGENT')) throw new ForbiddenException();
    if (ticket.assigneeId === actor.userId) return;
    if (ticket.assigneeId) throw new ForbiddenException();
    if (ticket.departmentId && !actor.departmentIds.includes(ticket.departmentId)) {
      throw new ForbiddenException();
    }
  }

  private assertPrivileged(actor: AuthenticatedActor): void {
    if (!this.isPrivileged(actor)) throw new ForbiddenException();
  }

  private isPrivileged(actor: AuthenticatedActor): boolean {
    return actor.roles.some((role) => PRIVILEGED_ROLES.has(role));
  }
}
