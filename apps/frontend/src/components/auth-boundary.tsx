'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [router, status]);

  if (status !== 'authenticated') {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <LoaderCircle className="size-5 animate-spin" />
          </span>
          <p className="text-sm text-muted-foreground">Preparando seu espaço de atendimento…</p>
        </div>
      </main>
    );
  }
  return children;
}
