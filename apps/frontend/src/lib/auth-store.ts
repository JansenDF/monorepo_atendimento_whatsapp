'use client';

import { create } from 'zustand';
import { AuthUser } from './types';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  setChecking(): void;
  setSession(accessToken: string, user: AuthUser): void;
  clearSession(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'checking',
  accessToken: null,
  user: null,
  setChecking: () => set({ status: 'checking' }),
  setSession: (accessToken, user) => set({ status: 'authenticated', accessToken, user }),
  clearSession: () => set({ status: 'anonymous', accessToken: null, user: null }),
}));
