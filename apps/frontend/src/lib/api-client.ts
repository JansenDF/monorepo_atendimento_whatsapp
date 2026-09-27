'use client';

import { useAuthStore } from './auth-store';
import { AuthSessionResponse, AuthUser } from './types';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST', credentials: 'include', cache: 'no-store',
        });
        if (!response.ok) throw new Error('A sessão expirou. Entre novamente.');
        const session = await response.json() as Partial<AuthSessionResponse>;
        if (typeof session.accessToken !== 'string' || !session.accessToken) throw new Error('A API não retornou um token de acesso.');
        const previousUser = useAuthStore.getState().user;
        const raw = session.user as (AuthUser & { fullName?: string }) | undefined;
        const user = raw
          ? { ...raw, name: raw.name || raw.fullName || raw.email, companyName: raw.companyName || 'Sua empresa' }
          : previousUser;
        if (!user) throw new Error('A sessão não retornou o usuário autenticado.');
        useAuthStore.getState().setSession(session.accessToken, user);
        return session.accessToken;
      } catch {
        useAuthStore.getState().clearSession();
        return null;
      }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true, headers: inputHeaders, ...init } = options;
  const headers = new Headers(inputHeaders);
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = authenticated ? useAuthStore.getState().accessToken : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Confira se o backend está ativo.', 0, path);
  }

  if (response.status === 401 && authenticated && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      headers.set('Authorization', `Bearer ${refreshedToken}`);
      try {
        response = await fetch(`${API_BASE_URL}${path}`, {
          ...init, headers, credentials: 'include', cache: 'no-store',
        });
      } catch {
        throw new ApiError('Não foi possível conectar à API. Confira se o backend está ativo.', 0, path);
      }
    }
  }
  if (response.status === 401 && path !== '/auth/refresh') {
    useAuthStore.getState().clearSession();
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message = thisErrorMessage(payload) ?? `Falha ao consultar a API (${response.status})`;
    throw new ApiError(message, response.status, path);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function thisErrorMessage(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (Array.isArray(record.message) && record.message.every((entry) => typeof entry === 'string')) {
    return record.message.join('. ');
  }
  return null;
}

export const apiClient = {
  get: <T>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, {
    method: 'POST',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};
