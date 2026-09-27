import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  TicketListOptions,
  TicketListResult,
  TicketMetrics,
  TicketMutationSnapshot,
  TicketRecord,
  TicketRepository,
  WorkflowTicketStatus,
} from './ticket.types';

const ticketListInclude = {
  customer: { select: { id: true, displayName: true } },
  contact: { select: { id: true, channel: true, address: true, displayName: true } },
  department: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true } },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, direction: true, type: true, status: true, body: true, createdAt: true },
  },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketInclude;

const ticketDetailsInclude = {
  customer: true,
  contact: true,
  department: true,
  assignee: { select: { id: true, fullName: true, email: true } },
  messages: {
      orderBy: { createdAt: 'desc' as const },
      take: 100,
      include: {
        author: { select: { id: true, fullName: true } },
        attachments: {
          select: {
            id: true,
            type: true,
            fileName: true,
            mimeType: true,
            byteSize: true,
            checksumSha256: true,
            createdAt: true,
          },
        },
      },
  },
  tags: { include: { tag: true } },
} satisfies Prisma.TicketInclude;

@Injectable()
export class PrismaTicketRepository implements TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(options: TicketListOptions): Promise<TicketListResult> {
    const where: Prisma.TicketWhereInput = {
      companyId: options.companyId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.assigneeId ? { assigneeId: options.assigneeId } : {}),
      ...(options.departmentId ? { departmentId: options.departmentId } : {}),
    };

    if (!options.actor.roles.some((role) => role === 'ADMIN' || role === 'SUPERVISOR') && options.actor.roles.includes('AGENT')) {
      where.AND = [
        {
          OR: [
            { assigneeId: options.actor.userId },
            {
              assigneeId: null,
              OR: [
                { departmentId: null },
                ...(options.departmentIds.length > 0 ? [{ departmentId: { in: options.departmentIds } }] : []),
              ],
            },
          ],
        },
      ];
    }

    const skip = (options.page - 1) * options.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: ticketListInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: options.pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { items, total, page: options.page, pageSize: options.pageSize };
  }

  async findById(companyId: string, ticketId: string): Promise<TicketRecord | null> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, companyId },
      include: ticketDetailsInclude,
    });
    return ticket as unknown as TicketRecord | null;
  }

  async isActiveDepartment(companyId: string, departmentId: string): Promise<boolean> {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, companyId, isActive: true },
      select: { id: true },
    });
    return department !== null;
  }

  async findUserForAssignment(companyId: string, userId: string, departmentId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
        isActive: true,
        roles: { some: { companyId, role: { code: 'AGENT' } } },
        departmentMemberships: {
          some: {
            companyId,
            departmentId,
            department: { isActive: true },
          },
        },
      },
      select: { id: true },
    });
    return user !== null;
  }

  async transition(input: {
    ticket: TicketMutationSnapshot;
    actorId: string;
    nextStatus: WorkflowTicketStatus;
    closedAt: Date | null;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.ticket.updateMany({
        where: this.snapshotWhere(input.ticket),
        data: {
          status: input.nextStatus,
          closedAt: input.closedAt,
        },
      });
      if (updated.count !== 1) return false;

      await this.enqueueTicketEvent(transaction, {
        companyId: input.ticket.companyId,
        ticketId: input.ticket.id,
        eventType: 'ticket.status_changed',
        payload: {
          ticketId: input.ticket.id,
          previousStatus: input.ticket.status,
          status: input.nextStatus,
          actorId: input.actorId,
        },
      });
      return true;
    });
  }

  async assume(input: { ticket: TicketMutationSnapshot; actorId: string }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.ticket.updateMany({
        where: {
          ...this.snapshotWhere(input.ticket),
          assigneeId: null,
          status: { in: ['OPEN', 'PENDING', 'WAITING_CUSTOMER'] },
        },
        data: { assigneeId: input.actorId },
      });
      if (updated.count !== 1) return false;

      await this.enqueueTicketEvent(transaction, {
        companyId: input.ticket.companyId,
        ticketId: input.ticket.id,
        eventType: 'ticket.assigned',
        payload: { ticketId: input.ticket.id, assigneeId: input.actorId, actorId: input.actorId },
      });
      return true;
    });
  }

  async transfer(input: {
    ticket: TicketMutationSnapshot;
    actorId: string;
    departmentId: string;
    assigneeId: string | null;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.ticket.updateMany({
        where: {
          ...this.snapshotWhere(input.ticket),
          status: { in: ['OPEN', 'PENDING', 'WAITING_CUSTOMER'] },
        },
        data: { departmentId: input.departmentId, assigneeId: input.assigneeId },
      });
      if (updated.count !== 1) return false;

      await this.enqueueTicketEvent(transaction, {
        companyId: input.ticket.companyId,
        ticketId: input.ticket.id,
        eventType: 'ticket.transferred',
        payload: {
          ticketId: input.ticket.id,
          previousDepartmentId: input.ticket.departmentId,
          departmentId: input.departmentId,
          previousAssigneeId: input.ticket.assigneeId,
          assigneeId: input.assigneeId,
          actorId: input.actorId,
        },
      });
      return true;
    });
  }

  async metrics(input: { companyId: string; from: Date; to: Date }): Promise<Omit<TicketMetrics, 'period'>> {
    const [responseRows, handlingRows, agentRows, departmentRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ averageSeconds: number | null }>>`
        WITH first_inbound AS (
          SELECT DISTINCT ON (m.ticket_id) m.ticket_id, m.created_at
          FROM messages m
          WHERE m.company_id = ${input.companyId}::uuid
            AND m.direction = 'INBOUND'
            AND m.status <> 'FAILED'
            AND m.created_at >= ${input.from}
            AND m.created_at < ${input.to}
          ORDER BY m.ticket_id, m.created_at ASC
        ), first_response AS (
          SELECT i.ticket_id,
            EXTRACT(EPOCH FROM (MIN(response.created_at) - i.created_at))::double precision AS response_seconds
          FROM first_inbound i
          JOIN messages response
            ON response.ticket_id = i.ticket_id
            AND response.company_id = ${input.companyId}::uuid
            AND response.direction = 'OUTBOUND'
            AND response.status IN ('SENT', 'DELIVERED', 'READ')
            AND response.created_at >= i.created_at
            AND response.created_at < ${input.to}
          GROUP BY i.ticket_id, i.created_at
        )
        SELECT AVG(response_seconds)::double precision AS "averageSeconds"
        FROM first_response
      `,
      this.prisma.$queryRaw<Array<{ averageSeconds: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)))::double precision AS "averageSeconds"
        FROM tickets t
        WHERE t.company_id = ${input.companyId}::uuid
          AND t.status = 'CLOSED'
          AND t.closed_at IS NOT NULL
          AND t.created_at >= ${input.from}
          AND t.created_at < ${input.to}
      `,
      this.prisma.$queryRaw<Array<{ agentId: string | null; agentName: string | null; count: number }>>`
        SELECT t.assignee_id AS "agentId", u.full_name AS "agentName", COUNT(*)::int AS "count"
        FROM tickets t
        LEFT JOIN users u ON u.id = t.assignee_id AND u.company_id = t.company_id
        WHERE t.company_id = ${input.companyId}::uuid
          AND t.created_at >= ${input.from}
          AND t.created_at < ${input.to}
        GROUP BY t.assignee_id, u.full_name
        ORDER BY COUNT(*) DESC, u.full_name ASC NULLS LAST
      `,
      this.prisma.$queryRaw<Array<{ departmentId: string | null; departmentName: string | null; count: number }>>`
        SELECT t.department_id AS "departmentId", d.name AS "departmentName", COUNT(*)::int AS "count"
        FROM tickets t
        LEFT JOIN departments d ON d.id = t.department_id AND d.company_id = t.company_id
        WHERE t.company_id = ${input.companyId}::uuid
          AND t.created_at >= ${input.from}
          AND t.created_at < ${input.to}
        GROUP BY t.department_id, d.name
        ORDER BY COUNT(*) DESC, d.name ASC NULLS LAST
      `,
    ]);

    return {
      averageFirstResponseSeconds: responseRows[0]?.averageSeconds ?? null,
      averageHandlingSeconds: handlingRows[0]?.averageSeconds ?? null,
      ticketsByAgent: agentRows,
      ticketsByDepartment: departmentRows,
    };
  }

  private snapshotWhere(ticket: TicketMutationSnapshot): Prisma.TicketWhereInput {
    return {
      id: ticket.id,
      companyId: ticket.companyId,
      status: ticket.status as NonNullable<Prisma.TicketWhereInput['status']>,
      assigneeId: ticket.assigneeId,
      departmentId: ticket.departmentId,
    };
  }

  private async enqueueTicketEvent(
    transaction: Prisma.TransactionClient,
    input: {
      companyId: string;
      ticketId: string;
      eventType: string;
      payload: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        companyId: input.companyId,
        aggregateType: 'ticket',
        aggregateId: input.ticketId,
        eventType: input.eventType,
        idempotencyKey: `${input.eventType}:${randomUUID()}`,
        payload: input.payload,
      },
    });
  }
}
