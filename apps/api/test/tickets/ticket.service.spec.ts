import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';
import { TicketRepository } from '../../src/tickets/ticket.types';
import { TicketService } from '../../src/tickets/ticket.service';

const COMPANY_ID = '0bc78439-60ed-4c02-8a40-1ca73af06402';
const AGENT_ID = 'f92d2d37-6b87-490d-80f6-646014b64ad8';
const DEPARTMENT_ID = '250c6953-cfb5-441e-8c89-f8a44431ae18';
const TICKET_ID = '44a65343-7d55-45da-b8da-54c52909a1d9';

const agent: AuthenticatedActor = {
  userId: AGENT_ID,
  companyId: COMPANY_ID,
  roles: ['AGENT'],
  departmentIds: [DEPARTMENT_ID],
};

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    companyId: COMPANY_ID,
    status: 'OPEN',
    assigneeId: null,
    departmentId: DEPARTMENT_ID,
    customerId: 'c10a2a80-4711-4bcf-8593-df38133e5136',
    contactId: '130301b4-e633-4768-8b99-bb58ca03da3e',
    channel: 'WHATSAPP',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setup(initialTicket = ticket()) {
  const repository = {
    list: jest.fn(),
    findById: jest.fn().mockResolvedValue(initialTicket),
    isActiveDepartment: jest.fn().mockResolvedValue(true),
    findUserForAssignment: jest.fn().mockResolvedValue(true),
    transition: jest.fn().mockResolvedValue(true),
    assume: jest.fn().mockResolvedValue(true),
    transfer: jest.fn().mockResolvedValue(true),
    metrics: jest.fn().mockResolvedValue({
      averageFirstResponseSeconds: 12,
      averageHandlingSeconds: 90,
      ticketsByAgent: [],
      ticketsByDepartment: [],
    }),
  } as unknown as jest.Mocked<TicketRepository>;
  return { service: new TicketService(repository), repository };
}

describe('TicketService', () => {
  it('rejects reopening a ticket that is not closed', async () => {
    const { service, repository } = setup(ticket({ status: 'OPEN' }));

    await expect(service.reopen(agent, TICKET_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('returns not found for a ticket outside the tenant scope', async () => {
    const { service, repository } = setup();
    repository.findById.mockResolvedValue(null);

    await expect(service.findById(agent, TICKET_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findById).toHaveBeenCalledWith(COMPANY_ID, TICKET_ID);
  });

  it('closes an accessible ticket and records the expected atomic transition', async () => {
    const { service, repository } = setup();

    await service.close(agent, TICKET_ID);

    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket: expect.objectContaining({ id: TICKET_ID, companyId: COMPANY_ID, status: 'OPEN' }),
        actorId: AGENT_ID,
        nextStatus: 'CLOSED',
        closedAt: expect.any(Date),
      }),
    );
  });

  it('rejects a status change that is not part of the state machine', async () => {
    const { service, repository } = setup(ticket({ status: 'CLOSED' }));

    await expect(service.changeStatus(agent, TICKET_ID, 'PENDING')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('reports a conflict when a concurrent status change wins', async () => {
    const { service, repository } = setup();
    repository.transition.mockResolvedValue(false);

    await expect(service.close(agent, TICKET_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('reopens a closed ticket and clears the closed timestamp', async () => {
    const { service, repository } = setup(ticket({ status: 'CLOSED' }));

    await service.reopen(agent, TICKET_ID);

    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({ nextStatus: 'OPEN', closedAt: null }),
    );
  });

  it('prevents an agent from viewing another agent’s assigned ticket', async () => {
    const { service } = setup(ticket({ assigneeId: '42b371b9-c38c-4904-bd3c-69a3aa57b383' }));

    await expect(service.findById(agent, TICKET_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an agent to assume an unassigned ticket in their department', async () => {
    const { service, repository } = setup();

    await service.assume(agent, TICKET_ID);

    expect(repository.assume).toHaveBeenCalledWith({
      ticket: expect.objectContaining({ id: TICKET_ID, companyId: COMPANY_ID }),
      actorId: AGENT_ID,
    });
  });

  it('returns an already assumed ticket without writing a second assignment', async () => {
    const { service, repository } = setup(ticket({ assigneeId: AGENT_ID }));

    await service.assume(agent, TICKET_ID);

    expect(repository.assume).not.toHaveBeenCalled();
  });

  it('does not allow an agent to assume a closed ticket', async () => {
    const { service, repository } = setup(ticket({ status: 'CLOSED' }));

    await expect(service.assume(agent, TICKET_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.assume).not.toHaveBeenCalled();
  });

  it('does not allow a supervisor to assume a ticket as an agent', async () => {
    const supervisor: AuthenticatedActor = { ...agent, roles: ['SUPERVISOR'] };
    const { service, repository } = setup();

    await expect(service.assume(supervisor, TICKET_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.assume).not.toHaveBeenCalled();
  });

  it('reports a conflict when another agent claims the ticket concurrently', async () => {
    const { service, repository } = setup();
    repository.assume.mockResolvedValue(false);

    await expect(service.assume(agent, TICKET_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('only allows supervisors and admins to transfer tickets', async () => {
    const { service, repository } = setup();

    await expect(service.transfer(agent, TICKET_ID, DEPARTMENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.transfer).not.toHaveBeenCalled();
  });

  it('transfers an open ticket to a valid agent in an active department', async () => {
    const supervisor: AuthenticatedActor = { ...agent, roles: ['SUPERVISOR'] };
    const { service, repository } = setup();

    await service.transfer(supervisor, TICKET_ID, DEPARTMENT_ID, AGENT_ID);

    expect(repository.isActiveDepartment).toHaveBeenCalledWith(COMPANY_ID, DEPARTMENT_ID);
    expect(repository.findUserForAssignment).toHaveBeenCalledWith(COMPANY_ID, AGENT_ID, DEPARTMENT_ID);
    expect(repository.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: DEPARTMENT_ID, assigneeId: AGENT_ID }),
    );
  });

  it('rejects inactive departments and users who are not eligible agents', async () => {
    const admin: AuthenticatedActor = { ...agent, roles: ['ADMIN'] };
    const { service, repository } = setup();
    repository.isActiveDepartment.mockResolvedValue(false);

    await expect(service.transfer(admin, TICKET_ID, DEPARTMENT_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.transfer).not.toHaveBeenCalled();

    repository.isActiveDepartment.mockResolvedValue(true);
    repository.findUserForAssignment.mockResolvedValue(false);
    await expect(service.transfer(admin, TICKET_ID, DEPARTMENT_ID, AGENT_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.transfer).not.toHaveBeenCalled();
  });

  it('does not transfer closed tickets', async () => {
    const admin: AuthenticatedActor = { ...agent, roles: ['ADMIN'] };
    const { service, repository } = setup(ticket({ status: 'CLOSED' }));

    await expect(service.transfer(admin, TICKET_ID, DEPARTMENT_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.isActiveDepartment).not.toHaveBeenCalled();
  });

  it('reports transfer races as conflicts', async () => {
    const admin: AuthenticatedActor = { ...agent, roles: ['ADMIN'] };
    const { service, repository } = setup();
    repository.transfer.mockResolvedValue(false);

    await expect(service.transfer(admin, TICKET_ID, DEPARTMENT_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes ticket queues to the agent assignment and departments', async () => {
    const { service, repository } = setup();
    repository.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    await service.list(agent, { page: 1, pageSize: 25 });

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_ID, actor: agent, departmentIds: [DEPARTMENT_ID] }),
    );
  });

  it('rejects agent queue filters for another agent or department', async () => {
    const { service, repository } = setup();

    await expect(service.list(agent, { page: 1, pageSize: 25, assigneeId: '42b371b9-c38c-4904-bd3c-69a3aa57b383' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(agent, { page: 1, pageSize: 25, departmentId: '42b371b9-c38c-4904-bd3c-69a3aa57b383' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('exposes metrics only to supervisors and administrators and validates the time range', async () => {
    const { service, repository } = setup();
    const admin: AuthenticatedActor = { ...agent, roles: ['ADMIN'] };

    await expect(service.metrics(agent)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.metrics(admin, 'not-a-date', '2026-06-01T00:00:00.000Z'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.metrics(admin, '2026-06-02T00:00:00.000Z', '2026-06-01T00:00:00.000Z'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.metrics(admin, '2024-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repository.metrics).not.toHaveBeenCalled();
  });

  it('returns tenant metrics with the requested ISO time range', async () => {
    const { service, repository } = setup();
    const admin: AuthenticatedActor = { ...agent, roles: ['ADMIN'] };

    const metrics = await service.metrics(admin, '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');

    expect(metrics).toEqual(expect.objectContaining({
      period: { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      averageFirstResponseSeconds: 12,
      averageHandlingSeconds: 90,
    }));
    expect(repository.metrics).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-07-01T00:00:00.000Z'),
    });
  });
});
