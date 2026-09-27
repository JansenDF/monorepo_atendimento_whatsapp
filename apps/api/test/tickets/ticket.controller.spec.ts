import { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';
import { TicketController } from '../../src/tickets/ticket.controller';
import { TicketService } from '../../src/tickets/ticket.service';

const actor: AuthenticatedActor = {
  userId: 'f92d2d37-6b87-490d-80f6-646014b64ad8',
  companyId: '0bc78439-60ed-4c02-8a40-1ca73af06402',
  roles: ['SUPERVISOR'],
  departmentIds: [],
};
const ticketId = '44a65343-7d55-45da-b8da-54c52909a1d9';

describe('TicketController', () => {
  const service = {
    list: jest.fn(),
    metrics: jest.fn(),
    findById: jest.fn(),
    changeStatus: jest.fn(),
    close: jest.fn(),
    reopen: jest.fn(),
    assume: jest.fn(),
    transfer: jest.fn(),
  };
  const controller = new TicketController(service as unknown as TicketService);

  beforeEach(() => jest.clearAllMocks());

  it('delegates list and metric endpoints to the ticket service', () => {
    const listQuery = { page: 2, pageSize: 10 };
    const metricsQuery = { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' };

    controller.list(actor, listQuery);
    controller.metrics(actor, metricsQuery);

    expect(service.list).toHaveBeenCalledWith(actor, listQuery);
    expect(service.metrics).toHaveBeenCalledWith(actor, metricsQuery.from, metricsQuery.to);
  });

  it('delegates ticket detail and state endpoints', () => {
    const status = { status: 'WAITING_CUSTOMER' as const };

    controller.findById(actor, ticketId);
    controller.changeStatus(actor, ticketId, status);
    controller.close(actor, ticketId);
    controller.reopen(actor, ticketId);
    controller.assume(actor, ticketId);

    expect(service.findById).toHaveBeenCalledWith(actor, ticketId);
    expect(service.changeStatus).toHaveBeenCalledWith(actor, ticketId, status.status);
    expect(service.close).toHaveBeenCalledWith(actor, ticketId);
    expect(service.reopen).toHaveBeenCalledWith(actor, ticketId);
    expect(service.assume).toHaveBeenCalledWith(actor, ticketId);
  });

  it('delegates transfer fields from the REST payload', () => {
    const body = {
      departmentId: '250c6953-cfb5-441e-8c89-f8a44431ae18',
      assigneeId: 'ea08ee4d-540f-4dcf-9928-71c07a7c91a3',
    };

    controller.transfer(actor, ticketId, body);

    expect(service.transfer).toHaveBeenCalledWith(actor, ticketId, body.departmentId, body.assigneeId);
  });
});
