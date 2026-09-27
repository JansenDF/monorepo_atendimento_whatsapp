import { PrismaService } from '../../src/database/prisma.service';
import { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';
import { PrismaTicketRepository } from '../../src/tickets/prisma-ticket.repository';
import { TicketMutationSnapshot } from '../../src/tickets/ticket.types';

const COMPANY_ID = '0bc78439-60ed-4c02-8a40-1ca73af06402';
const USER_ID = 'f92d2d37-6b87-490d-80f6-646014b64ad8';
const DEPARTMENT_ID = '250c6953-cfb5-441e-8c89-f8a44431ae18';
const TICKET_ID = '44a65343-7d55-45da-b8da-54c52909a1d9';

const snapshot: TicketMutationSnapshot = {
  id: TICKET_ID,
  companyId: COMPANY_ID,
  status: 'OPEN',
  assigneeId: null,
  departmentId: DEPARTMENT_ID,
};

function setup(updateCount = 1) {
  const transaction = {
    ticket: { updateMany: jest.fn().mockResolvedValue({ count: updateCount }) },
    outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-id' }) },
  };
  const prisma = {
    ticket: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    department: { findFirst: jest.fn().mockResolvedValue({ id: DEPARTMENT_ID }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: USER_ID }) },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(transaction)),
    $queryRaw: jest.fn(),
  } as unknown as PrismaService;
  return {
    repository: new PrismaTicketRepository(prisma),
    prisma: prisma as unknown as {
      ticket: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
      department: { findFirst: jest.Mock };
      user: { findFirst: jest.Mock };
      $queryRaw: jest.Mock;
    },
    transaction,
  };
}

describe('PrismaTicketRepository', () => {
  it('lists tenant-scoped tickets with stable pagination for supervisors', async () => {
    const { repository, prisma } = setup();
    const actor: AuthenticatedActor = { userId: USER_ID, companyId: COMPANY_ID, roles: ['SUPERVISOR'], departmentIds: [] };

    await repository.list({ companyId: COMPANY_ID, actor, departmentIds: [], page: 2, pageSize: 10 });

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: COMPANY_ID },
        skip: 10,
        take: 10,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('limits agent queues to their own assignments and department queues', async () => {
    const { repository, prisma } = setup();
    const actor: AuthenticatedActor = { userId: USER_ID, companyId: COMPANY_ID, roles: ['AGENT'], departmentIds: [DEPARTMENT_ID] };

    await repository.list({ companyId: COMPANY_ID, actor, departmentIds: [DEPARTMENT_ID], page: 1, pageSize: 25 });

    const where = prisma.ticket.findMany.mock.calls[0]?.[0].where;
    expect(where).toEqual(expect.objectContaining({
      companyId: COMPANY_ID,
      AND: [
        expect.objectContaining({
          OR: [
            { assigneeId: USER_ID },
            { assigneeId: null, OR: [{ departmentId: null }, { departmentId: { in: [DEPARTMENT_ID] } }] },
          ],
        }),
      ],
    }));
  });

  it('scopes ticket detail lookup by both id and company', async () => {
    const { repository, prisma } = setup();
    prisma.ticket.findFirst.mockResolvedValue({ ...snapshot, messages: [] });

    await repository.findById(COMPANY_ID, TICKET_ID);

    expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TICKET_ID, companyId: COMPANY_ID } }),
    );
  });

  it('checks active departments and eligible agents within the tenant', async () => {
    const { repository, prisma } = setup();

    await expect(repository.isActiveDepartment(COMPANY_ID, DEPARTMENT_ID)).resolves.toBe(true);
    await expect(repository.findUserForAssignment(COMPANY_ID, USER_ID, DEPARTMENT_ID)).resolves.toBe(true);

    expect(prisma.department.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DEPARTMENT_ID, companyId: COMPANY_ID, isActive: true } }),
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: USER_ID,
          companyId: COMPANY_ID,
          isActive: true,
          roles: expect.any(Object),
          departmentMemberships: expect.any(Object),
        }),
      }),
    );
  });

  it('persists a status transition and its outbox event in one transaction', async () => {
    const { repository, transaction } = setup();

    await expect(repository.transition({
      ticket: snapshot,
      actorId: USER_ID,
      nextStatus: 'CLOSED',
      closedAt: new Date('2026-06-01T12:00:00.000Z'),
    })).resolves.toBe(true);

    expect(transaction.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: TICKET_ID, companyId: COMPANY_ID, status: 'OPEN' }),
        data: expect.objectContaining({ status: 'CLOSED', closedAt: expect.any(Date) }),
      }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'ticket.closed' }) }),
    );
  });

  it('does not publish an event when a concurrent status change already won', async () => {
    const { repository, transaction } = setup(0);

    await expect(repository.transition({
      ticket: snapshot,
      actorId: USER_ID,
      nextStatus: 'CLOSED',
      closedAt: new Date(),
    })).resolves.toBe(false);

    expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('claims an unassigned ticket and records the assignment event', async () => {
    const { repository, transaction } = setup();

    await expect(repository.assume({ ticket: snapshot, actorId: USER_ID })).resolves.toBe(true);
    expect(transaction.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeId: null, status: { in: ['OPEN', 'PENDING', 'WAITING_CUSTOMER'] } }),
        data: { assigneeId: USER_ID },
      }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'ticket.assigned' }) }),
    );
  });

  it('transfers a ticket to a department and optional agent with an outbox event', async () => {
    const { repository, transaction } = setup();

    await expect(repository.transfer({
      ticket: snapshot,
      actorId: USER_ID,
      departmentId: DEPARTMENT_ID,
      assigneeId: USER_ID,
    })).resolves.toBe(true);

    expect(transaction.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { departmentId: DEPARTMENT_ID, assigneeId: USER_ID },
      }),
    );
    expect(transaction.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'ticket.transferred' }) }),
    );
  });

  it('aggregates response, handling, agent and department metrics with tenant-scoped SQL', async () => {
    const { repository, prisma } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ averageSeconds: 12.5 }])
      .mockResolvedValueOnce([{ averageSeconds: 180 }])
      .mockResolvedValueOnce([{ agentId: USER_ID, agentName: 'Agent', count: 3 }])
      .mockResolvedValueOnce([{ departmentId: DEPARTMENT_ID, departmentName: 'Support', count: 3 }]);

    const metrics = await repository.metrics({
      companyId: COMPANY_ID,
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(metrics).toEqual({
      averageFirstResponseSeconds: 12.5,
      averageHandlingSeconds: 180,
      ticketsByAgent: [{ agentId: USER_ID, agentName: 'Agent', count: 3 }],
      ticketsByDepartment: [{ departmentId: DEPARTMENT_ID, departmentName: 'Support', count: 3 }],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
  });
});
