'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assumeTicket,
  closeTicket,
  getAgents,
  getCustomerDetails,
  getCustomers,
  getDepartments,
  getTicket,
  getTicketMetrics,
  getTicketStatusCounts,
  getTickets,
  reopenTicket,
  sendTicketMessage,
  transferTicket,
  updateCustomer,
} from './data';
import { TicketQuery } from './data';
import { CustomerValues } from './schemas';
import { TicketStatus } from './types';

export const queryKeys = {
  tickets: ['tickets'] as const,
  ticketLists: ['tickets', 'list'] as const,
  ticket: (id: string) => ['tickets', 'detail', id] as const,
  ticketMetrics: ['tickets', 'metrics'] as const,
  ticketStatusCounts: ['tickets', 'status-counts'] as const,
  customers: (search: string) => ['customers', search] as const,
  customer: (id: string) => ['customers', 'detail', id] as const,
  departments: ['departments'] as const,
  agents: (departmentId?: string) => ['agents', departmentId ?? 'all'] as const,
};

export function useTickets(query: TicketQuery = {}) {
  return useQuery({ queryKey: [...queryKeys.ticketLists, query], queryFn: () => getTickets(query), refetchInterval: 12_000 });
}

export function useTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ticket(ticketId ?? ''),
    queryFn: () => getTicket(ticketId!),
    enabled: Boolean(ticketId),
    refetchInterval: 12_000,
  });
}

export function useTicketMetrics(enabled = true) {
  return useQuery({ queryKey: queryKeys.ticketMetrics, queryFn: getTicketMetrics, enabled, refetchInterval: 60_000 });
}

export function useTicketStatusCounts() {
  return useQuery({ queryKey: queryKeys.ticketStatusCounts, queryFn: getTicketStatusCounts, refetchInterval: 60_000 });
}

export function useCustomers(search: string, page = 1) {
  return useQuery({ queryKey: [...queryKeys.customers(search), page], queryFn: () => getCustomers(search, page) });
}

export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customer(customerId ?? ''),
    queryFn: () => getCustomerDetails(customerId!),
    enabled: Boolean(customerId),
  });
}

export function useDepartments(enabled = true) {
  return useQuery({ queryKey: queryKeys.departments, queryFn: getDepartments, enabled });
}

export function useAgents(departmentId?: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.agents(departmentId), queryFn: () => getAgents(departmentId), enabled });
}

function useTicketAction<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets }),
        queryClient.invalidateQueries({ queryKey: queryKeys.ticketMetrics }),
      ]);
    },
  });
}

export function useCloseTicket() { return useTicketAction((ticketId: string) => closeTicket(ticketId)); }
export function useReopenTicket() { return useTicketAction((ticketId: string) => reopenTicket(ticketId)); }
export function useAssumeTicket() { return useTicketAction((ticketId: string) => assumeTicket(ticketId)); }
export function useTransferTicket() {
  return useTicketAction(({ ticketId, departmentId, assigneeId }: { ticketId: string; departmentId: string; assigneeId?: string }) =>
    transferTicket(ticketId, departmentId, assigneeId),
  );
}
export function useSendTicketMessage() {
  return useTicketAction(({ ticketId, body }: { ticketId: string; body: string }) => sendTicketMessage(ticketId, body));
}
export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, values }: { customerId: string; values: CustomerValues }) => updateCustomer(customerId, values),
    onSuccess: async (customer) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.customer(customer.id) }),
      ]);
    },
  });
}

export function ticketStatusLabel(status: TicketStatus) {
  const labels: Record<TicketStatus, string> = {
    OPEN: 'Aberto', PENDING: 'Pendente', WAITING_CUSTOMER: 'Aguardando cliente', CLOSED: 'Encerrado',
  };
  return labels[status];
}
