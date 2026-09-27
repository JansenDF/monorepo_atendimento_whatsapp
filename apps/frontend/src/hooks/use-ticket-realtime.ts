'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/auth-store';
import { isDemoMode } from '@/lib/demo-mode';
import { queryKeys } from '@/lib/query-hooks';

type ConnectionState = 'demo' | 'connecting' | 'connected' | 'disconnected';

export function useTicketRealtime(ticketId?: string): ConnectionState {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>(isDemoMode ? 'demo' : 'disconnected');

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
      reconnectionAttempts: 8,
      reconnectionDelayMax: 10_000,
    });
    setState('connecting');
    socket.on('connect', () => {
      setState('connected');
      if (ticketId) socket.emit('ticket:join', { ticketId });
    });
    socket.on('disconnect', () => setState('disconnected'));
    socket.on('connect_error', () => setState('disconnected'));

    const refreshTickets = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketMetrics });
      if (ticketId) void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
    };
    for (const event of ['message.received', 'message.sent', 'ticket.created', 'ticket.closed', 'ticket.status_changed']) {
      socket.on(event, refreshTickets);
    }
    socket.connect();
    return () => { socket.disconnect(); };
  }, [queryClient, ticketId, token]);

  return state;
}
