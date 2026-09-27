'use client';

import { apiClient } from './api-client';
import { isDemoMode } from './demo-mode';
import {
  demoAgents,
  demoAssume,
  demoChangeStatus,
  demoCustomerDetails,
  demoCustomers,
  demoDepartments,
  demoMetrics,
  demoSendMessage,
  demoStatusCounts,
  demoTicket,
  demoTickets,
  demoTransfer,
  demoUpdateCustomer,
} from './demo-store';
import { Customer, CustomerDetails, DepartmentOption, AgentOption, Page, Ticket, TicketMetrics, TicketStatus, TicketStatusCounts } from './types';

export interface TicketQuery {
  status?: TicketStatus;
  page?: number;
  pageSize?: number;
}

export async function getTickets(query: TicketQuery = {}): Promise<Page<Ticket>> {
  const normalized = { page: query.page ?? 1, pageSize: query.pageSize ?? 25, ...(query.status ? { status: query.status } : {}) };
  if (isDemoMode) return demoTickets(normalized);
  const params = new URLSearchParams({ page: String(normalized.page), pageSize: String(normalized.pageSize) });
  if (normalized.status) params.set('status', normalized.status);
  return apiClient.get<Page<Ticket>>(`/tickets?${params.toString()}`);
}

export async function getTicket(ticketId: string): Promise<Ticket> {
  if (isDemoMode) return demoTicket(ticketId);
  return apiClient.get<Ticket>(`/tickets/${encodeURIComponent(ticketId)}`);
}

export async function getTicketMetrics(): Promise<TicketMetrics> {
  if (isDemoMode) return demoMetrics();
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return apiClient.get<TicketMetrics>(`/tickets/metrics?${params.toString()}`);
}

export async function getTicketStatusCounts(): Promise<TicketStatusCounts> {
  if (isDemoMode) return demoStatusCounts();
  const statuses: TicketStatus[] = ['OPEN', 'PENDING', 'WAITING_CUSTOMER', 'CLOSED'];
  const entries = await Promise.all(statuses.map(async (status) => {
    const params = new URLSearchParams({ status, page: '1', pageSize: '1' });
    const page = await apiClient.get<Page<Ticket>>(`/tickets?${params.toString()}`);
    return [status, page.total] as const;
  }));
  return Object.fromEntries(entries) as TicketStatusCounts;
}

export async function closeTicket(ticketId: string) {
  if (isDemoMode) return demoChangeStatus(ticketId, 'CLOSED');
  return apiClient.post<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/close`);
}

export async function reopenTicket(ticketId: string) {
  if (isDemoMode) return demoChangeStatus(ticketId, 'OPEN');
  return apiClient.post<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/reopen`);
}

export async function assumeTicket(ticketId: string) {
  if (isDemoMode) return demoAssume(ticketId);
  return apiClient.post<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/assume`);
}

export async function transferTicket(ticketId: string, departmentId: string, assigneeId?: string) {
  if (isDemoMode) return demoTransfer(ticketId, departmentId, assigneeId || null);
  return apiClient.post<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/transfer`, {
    departmentId,
    ...(assigneeId ? { assigneeId } : {}),
  });
}

export async function sendTicketMessage(ticketId: string, body: string) {
  if (isDemoMode) return demoSendMessage(ticketId, body);
  return apiClient.post<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/messages`, { body });
}

export async function getCustomers(search: string, page = 1): Promise<Page<Customer>> {
  if (isDemoMode) return demoCustomers(search, page);
  const params = new URLSearchParams({ search, page: String(page), pageSize: '25' });
  return apiClient.get<Page<Customer>>(`/customers?${params.toString()}`);
}

export async function getCustomerDetails(customerId: string): Promise<CustomerDetails> {
  if (isDemoMode) return demoCustomerDetails(customerId);
  const [customer, tickets] = await Promise.all([
    apiClient.get<Customer>(`/customers/${encodeURIComponent(customerId)}`),
    apiClient.get<Ticket[]>(`/customers/${encodeURIComponent(customerId)}/tickets`),
  ]);
  return { ...customer, tickets };
}

export async function updateCustomer(customerId: string, input: { displayName: string; email: string; notes?: string }) {
  if (isDemoMode) return demoUpdateCustomer(customerId, input);
  return apiClient.patch<Customer>(`/customers/${encodeURIComponent(customerId)}`, {
    displayName: input.displayName,
    email: input.email || null,
    notes: input.notes ?? null,
  });
}

export async function getDepartments(): Promise<DepartmentOption[]> {
  if (isDemoMode) return demoDepartments();
  const response = await apiClient.get<DepartmentOption[] | Page<DepartmentOption>>('/departments?isActive=true');
  return Array.isArray(response) ? response : response.items;
}

export async function getAgents(departmentId?: string): Promise<AgentOption[]> {
  if (isDemoMode) return demoAgents(departmentId);
  const params = new URLSearchParams({ role: 'AGENT', isActive: 'true' });
  if (departmentId) params.set('departmentId', departmentId);
  const response = await apiClient.get<AgentOption[] | Page<AgentOption>>(`/users?${params.toString()}`);
  return Array.isArray(response) ? response : response.items;
}
