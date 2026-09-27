'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/auth-store';
import { isDemoMode } from '@/lib/demo-mode';
import { queryKeys } from '@/lib/query-hooks';

type ConnectionState = 'demo' | 'connecting' | 'connected' | 'disconnected';

const ticketEvents = [
  'ticket.created',
  'message.received',
  'message.sent',
  'message.status_changed',
  'ticket.closed',
  'ticket.status_changed',
] as const;

export function useTicketRealtime(ticketId?: string): ConnectionState {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const selectedTicketRef = useRef(ticketId);
  const [state, setState] = useState<ConnectionState>(isDemoMode ? 'demo' : 'disconnected');

  useEffect(() => {
    const previousTicketId = selectedTicketRef.current;
    selectedTicketRef.current = ticketId;
    const socket = socketRef.current;
    if (!socket?.connected || previousTicketId === ticketId) return;
    if (previousTicketId) socket.emit('ticket:leave', { ticketId: previousTicketId });
    if (ticketId) socket.emit('ticket:join', { ticketId });
  }, [ticketId]);

  useEffect(() => {
    if (isDemoMode) {
      setState('demo');
      return;
    }
    if (!token) {
      setState('disconnected');
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const socket: Socket = io(socketUrl, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
      timeout: 20_000,
    });
    socketRef.current = socket;
    setState('connecting');

    const invalidateTicketLists = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketStatusCounts });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketMetrics });
    };
    const invalidateTicketHistory = (payload: unknown) => {
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
      const changedTicketId = (payload as Record<string, unknown>).ticketId;
      if (typeof changedTicketId === 'string') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(changedTicketId) });
      }
    };

    socket.on('connect', () => {
      setState('connected');
      const selectedTicketId = selectedTicketRef.current;
      if (selectedTicketId) socket.emit('ticket:join', { ticketId: selectedTicketId });
      // Redis adapter delivery is transient; refetch after every reconnect to fill gaps.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    });
    socket.on('disconnect', () => setState('disconnected'));
    socket.on('connect_error', () => setState('disconnected'));
    socket.on('tickets.changed', invalidateTicketLists);
    socket.on('ticket.created', (payload: unknown) => {
      invalidateTicketLists();
      invalidateTicketHistory(payload);
    });
    for (const event of ticketEvents.filter((name) => name !== 'ticket.created')) {
      socket.on(event, invalidateTicketHistory);
    }

    socket.connect();
    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [queryClient, token]);

  return state;
}
