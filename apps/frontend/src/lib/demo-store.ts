import {
  AgentOption,
  Customer,
  CustomerDetails,
  DepartmentOption,
  Page,
  Ticket,
  TicketMessage,
  TicketMetrics,
  TicketStatus,
  TicketStatusCounts,
} from './types';

export const DEMO_USER = {
  id: 'ea08ee4d-540f-4dcf-9928-71c07a7c91a3',
  name: 'Marina Costa',
  email: 'marina@acme.com',
  companyName: 'Acme Studio',
  roles: ['ADMIN'] as Array<'ADMIN'>,
};

const now = Date.now();
const timeAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();
const departments: DepartmentOption[] = [
  { id: '250c6953-cfb5-441e-8c89-f8a44431ae18', name: 'Atendimento' },
  { id: '7abcf90b-485e-42f5-9037-30193ac13df4', name: 'Financeiro' },
  { id: '098708d4-93df-45e6-8c85-ec2d1aef2e34', name: 'Comercial' },
];
const agents: AgentOption[] = [
  { id: 'f92d2d37-6b87-490d-80f6-646014b64ad8', fullName: 'Lucas Almeida', departmentId: departments[0]!.id },
  { id: 'ac879052-1782-46e4-8c50-2e64bda96d7a', fullName: 'Beatriz Santos', departmentId: departments[0]!.id },
  { id: '6a8ef8e5-a808-428e-9c80-1a1817172f44', fullName: 'Rafael Lima', departmentId: departments[1]!.id },
  { id: 'f5c29a94-05e5-440f-8832-2e42f8fbe16c', fullName: 'Júlia Fernandes', departmentId: departments[2]!.id },
];

const customers: Customer[] = [
  {
    id: 'c10a2a80-4711-4bcf-8593-df38133e5136', displayName: 'Ana Clara Mendes', email: 'ana.mendes@email.com',
    createdAt: timeAgo(24 * 80), updatedAt: timeAgo(2), ticketCount: 8,
    contacts: [{ id: 'ca001', channel: 'WHATSAPP', address: '+55 11 99876-5432', isPrimary: true }],
  },
  {
    id: 'd407c6ae-f77c-4a9a-9230-9d6fe6a2ba03', displayName: 'Pedro Henrique', email: 'pedro.h@email.com',
    createdAt: timeAgo(24 * 55), updatedAt: timeAgo(5), ticketCount: 5,
    contacts: [{ id: 'ca002', channel: 'WHATSAPP', address: '+55 21 98765-4321', isPrimary: true }],
  },
  {
    id: '4a207d44-9233-4f99-8563-825c9b9fb21e', displayName: 'Camila Oliveira', email: 'camila.oliveira@email.com',
    createdAt: timeAgo(24 * 30), updatedAt: timeAgo(10), ticketCount: 3,
    contacts: [{ id: 'ca003', channel: 'WHATSAPP', address: '+55 31 97654-3210', isPrimary: true }],
  },
  {
    id: '08099839-f407-4490-aa87-e12c5b979123', displayName: 'João Victor Rocha', email: 'joao.rocha@email.com',
    createdAt: timeAgo(24 * 20), updatedAt: timeAgo(18), ticketCount: 2,
    contacts: [{ id: 'ca004', channel: 'WHATSAPP', address: '+55 41 96543-2109', isPrimary: true }],
  },
  {
    id: 'b3cd987a-7b35-47d2-87b2-43a04ff0c210', displayName: 'Fernanda Souza', email: 'fernanda.s@email.com',
    createdAt: timeAgo(24 * 12), updatedAt: timeAgo(26), ticketCount: 1,
    contacts: [{ id: 'ca005', channel: 'WHATSAPP', address: '+55 61 95432-1098', isPrimary: true }],
  },
  {
    id: '19869e6a-c931-4be5-968a-4eb7f72bc2e3', displayName: 'Marcos Vinícius', email: 'marcos.v@email.com',
    createdAt: timeAgo(24 * 4), updatedAt: timeAgo(30), ticketCount: 1,
    contacts: [{ id: 'ca006', channel: 'WHATSAPP', address: '+55 85 94321-0987', isPrimary: true }],
  },
];

function message(id: string, direction: TicketMessage['direction'], body: string, hoursAgo: number): TicketMessage {
  return {
    id,
    direction,
    type: 'TEXT',
    status: direction === 'INBOUND' ? 'RECEIVED' : 'READ',
    body,
    createdAt: timeAgo(hoursAgo),
    ...(direction === 'OUTBOUND' ? { author: { id: agents[0]!.id, fullName: agents[0]!.fullName } } : {}),
  };
}

let tickets: Ticket[] = [
  {
    id: '44a65343-7d55-45da-b8da-54c52909a1d9', subject: 'Dúvida sobre o pedido #4821', status: 'OPEN', priority: 'HIGH',
    channel: 'WHATSAPP', createdAt: timeAgo(0.4), updatedAt: timeAgo(0.04),
    customer: { id: customers[0]!.id, displayName: customers[0]!.displayName },
    contact: { id: 'ca001', address: customers[0]!.contacts[0]!.address, channel: 'WHATSAPP' },
    department: departments[0], assignee: { id: agents[0]!.id, fullName: agents[0]!.fullName },
    messages: [message('m101', 'INBOUND', 'Oi! Meu pedido aparece como entregue, mas não chegou por aqui.', 0.4), message('m102', 'OUTBOUND', 'Olá, Ana! Vou verificar o rastreamento para você.', 0.2)],
    _count: { messages: 4 },
  },
  {
    id: 'ef57b0d7-1834-4a0c-a192-681a4fd066f0', subject: 'Segunda via do boleto', status: 'WAITING_CUSTOMER', priority: 'NORMAL',
    channel: 'WHATSAPP', createdAt: timeAgo(3), updatedAt: timeAgo(0.3),
    customer: { id: customers[1]!.id, displayName: customers[1]!.displayName },
    contact: { id: 'ca002', address: customers[1]!.contacts[0]!.address, channel: 'WHATSAPP' },
    department: departments[1], assignee: { id: agents[2]!.id, fullName: agents[2]!.fullName },
    messages: [message('m201', 'INBOUND', 'Preciso da segunda via do boleto deste mês.', 3), message('m202', 'OUTBOUND', 'Enviei para o seu e-mail. Consegue confirmar se recebeu?', 1)],
    _count: { messages: 2 },
  },
  {
    id: 'd552b379-8fe7-4ad2-85c9-c64067c9bb7b', subject: 'Troca de endereço de entrega', status: 'PENDING', priority: 'NORMAL',
    channel: 'WHATSAPP', createdAt: timeAgo(5), updatedAt: timeAgo(1),
    customer: { id: customers[2]!.id, displayName: customers[2]!.displayName },
    contact: { id: 'ca003', address: customers[2]!.contacts[0]!.address, channel: 'WHATSAPP' },
    department: departments[2], assignee: { id: agents[3]!.id, fullName: agents[3]!.fullName },
    messages: [message('m301', 'INBOUND', 'Ainda dá tempo de alterar o endereço?', 5)], _count: { messages: 1 },
  },
  {
    id: 'a62acb9e-0b34-4c2c-8d72-39a774405e2e', subject: 'Produto com avaria', status: 'OPEN', priority: 'URGENT',
    channel: 'WHATSAPP', createdAt: timeAgo(7), updatedAt: timeAgo(2),
    customer: { id: customers[3]!.id, displayName: customers[3]!.displayName },
    contact: { id: 'ca004', address: customers[3]!.contacts[0]!.address, channel: 'WHATSAPP' },
    department: departments[0], assignee: null,
    messages: [message('m401', 'INBOUND', 'Recebi o produto com a embalagem amassada.', 7)], _count: { messages: 1 },
  },
  {
    id: 'c2612a2d-0d82-43ef-81dc-912a84037a5a', subject: 'Informações sobre o plano Pro', status: 'CLOSED', priority: 'LOW',
    channel: 'WHATSAPP', createdAt: timeAgo(52), updatedAt: timeAgo(24), closedAt: timeAgo(24),
    customer: { id: customers[4]!.id, displayName: customers[4]!.displayName },
    contact: { id: 'ca005', address: customers[4]!.contacts[0]!.address, channel: 'WHATSAPP' },
    department: departments[2], assignee: { id: agents[3]!.id, fullName: agents[3]!.fullName },
    messages: [message('m501', 'INBOUND', 'Quais são os recursos incluídos no plano Pro?', 52)], _count: { messages: 3 },
  },
];

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 180));
}

export async function demoLogin(email: string) {
  return wait({ accessToken: 'demo-session', user: { ...DEMO_USER, email: email || DEMO_USER.email } });
}

export async function demoTickets(input: { status?: TicketStatus; page: number; pageSize: number }): Promise<Page<Ticket>> {
  const filtered = tickets.filter((ticket) => !input.status || ticket.status === input.status);
  const offset = (input.page - 1) * input.pageSize;
  return wait({ items: filtered.slice(offset, offset + input.pageSize), total: filtered.length, page: input.page, pageSize: input.pageSize });
}

export async function demoTicket(ticketId: string) {
  const ticket = tickets.find((entry) => entry.id === ticketId);
  if (!ticket) throw new Error('Ticket não encontrado');
  return wait(ticket);
}

export async function demoMetrics(): Promise<TicketMetrics> {
  const active = tickets.filter((ticket) => ticket.status !== 'CLOSED');
  return wait({
    period: { from: timeAgo(24 * 30), to: new Date(now).toISOString() },
    averageFirstResponseSeconds: 194,
    averageHandlingSeconds: 3540,
    ticketsByAgent: agents.slice(0, 3).map((agent, index) => ({ agentId: agent.id, agentName: agent.fullName, count: [28, 21, 16][index]! })),
    ticketsByDepartment: departments.map((department, index) => ({ departmentId: department.id, departmentName: department.name, count: [36, 22, 17][index]! })),
  });
}

export async function demoStatusCounts(): Promise<TicketStatusCounts> {
  return wait({
    OPEN: tickets.filter((ticket) => ticket.status === 'OPEN').length,
    PENDING: tickets.filter((ticket) => ticket.status === 'PENDING').length,
    WAITING_CUSTOMER: tickets.filter((ticket) => ticket.status === 'WAITING_CUSTOMER').length,
    CLOSED: tickets.filter((ticket) => ticket.status === 'CLOSED').length,
  });
}

export async function demoChangeStatus(ticketId: string, status: TicketStatus) {
  return updateTicket(ticketId, (ticket) => ({ ...ticket, status, closedAt: status === 'CLOSED' ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }));
}

export async function demoAssume(ticketId: string) {
  return updateTicket(ticketId, (ticket) => ({ ...ticket, assignee: { id: DEMO_USER.id, fullName: DEMO_USER.name }, updatedAt: new Date().toISOString() }));
}

export async function demoTransfer(ticketId: string, departmentId: string, assigneeId: string | null) {
  const department = departments.find((entry) => entry.id === departmentId);
  const assignee = agents.find((entry) => entry.id === assigneeId);
  return updateTicket(ticketId, (ticket) => ({
    ...ticket,
    department: department ?? null,
    assignee: assignee ? { id: assignee.id, fullName: assignee.fullName } : null,
    updatedAt: new Date().toISOString(),
  }));
}

export async function demoSendMessage(ticketId: string, body: string) {
  return updateTicket(ticketId, (ticket) => ({
    ...ticket,
    messages: [...(ticket.messages ?? []), {
      id: `demo-${Date.now()}`,
      direction: 'OUTBOUND',
      type: 'TEXT',
      status: 'SENT',
      body,
      createdAt: new Date().toISOString(),
      author: { id: DEMO_USER.id, fullName: DEMO_USER.name },
    }],
    updatedAt: new Date().toISOString(),
  }));
}

export async function demoCustomers(search: string, page = 1): Promise<Page<Customer>> {
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = customers.filter((customer) =>
    !normalized || customer.displayName.toLocaleLowerCase('pt-BR').includes(normalized) ||
      customer.email?.toLocaleLowerCase('pt-BR').includes(normalized) ||
      customer.contacts.some((contact) => contact.address.includes(normalized)),
  );
  const pageSize = 25;
  const offset = (page - 1) * pageSize;
  return wait({ items: filtered.slice(offset, offset + pageSize), total: filtered.length, page, pageSize });
}

export async function demoCustomerDetails(customerId: string): Promise<CustomerDetails> {
  const customer = customers.find((entry) => entry.id === customerId);
  if (!customer) throw new Error('Cliente não encontrado');
  return wait({ ...customer, tickets: tickets.filter((ticket) => ticket.customer.id === customerId) });
}

export async function demoUpdateCustomer(customerId: string, input: { displayName: string; email: string; notes?: string }) {
  const index = customers.findIndex((customer) => customer.id === customerId);
  if (index < 0) throw new Error('Cliente não encontrado');
  customers[index] = { ...customers[index]!, ...input, email: input.email || null, updatedAt: new Date().toISOString() };
  return wait(customers[index]!);
}

export async function demoDepartments() { return wait(departments); }
export async function demoAgents(departmentId?: string) {
  return wait(agents.filter((agent) => !departmentId || agent.departmentId === departmentId));
}

async function updateTicket(ticketId: string, update: (ticket: Ticket) => Ticket): Promise<Ticket> {
  const index = tickets.findIndex((ticket) => ticket.id === ticketId);
  if (index < 0) throw new Error('Ticket não encontrado');
  tickets[index] = update(tickets[index]!);
  return wait(tickets[index]!);
}
