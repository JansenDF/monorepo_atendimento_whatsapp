'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/lib/auth-store';
import { apiRequest } from '@/lib/api-client';
import { DEMO_USER, demoLogin } from '@/lib/demo-store';
import { isDemoMode } from '@/lib/demo-mode';
import { AuthSessionResponse, AuthUser } from '@/lib/types';

function normalizeSession(response: AuthSessionResponse): AuthSessionResponse {
  const raw = response.user as AuthUser & { fullName?: string };
  return {
    accessToken: response.accessToken,
    user: { ...raw, name: raw.name || raw.fullName || raw.email, companyName: raw.companyName || 'Sua empresa' },
  };
}

function SessionBootstrap() {
  const setChecking = useAuthStore((state) => state.setChecking);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    let active = true;
    setChecking();
    const restore = async () => {
      try {
        if (isDemoMode) {
          const session = await demoLogin(DEMO_USER.email);
          if (active) setSession(session.accessToken, session.user);
          return;
        }
        const session = await apiRequest<AuthSessionResponse>('/auth/refresh', { method: 'POST', authenticated: false });
        if (active) {
          const normalized = normalizeSession(session);
          setSession(normalized.accessToken, normalized.user);
        }
      } catch {
        if (active) clearSession();
      }
    };
    void restore();
    return () => { active = false; };
  }, [clearSession, setChecking, setSession]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          const status = 'status' in error ? Number(error.status) : 0;
          return failureCount < 2 && status !== 401 && status !== 403 && status !== 404;
        },
      },
      mutations: { retry: 0 },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <SessionBootstrap />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
