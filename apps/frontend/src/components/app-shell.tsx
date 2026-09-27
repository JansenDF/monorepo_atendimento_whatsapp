'use client';

import { Bell, ChevronDown, Command, LayoutDashboard, LifeBuoy, Menu, MessageSquareText, Settings2, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AuthBoundary } from '@/components/auth-boundary';
import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { isDemoMode } from '@/lib/demo-mode';
import { cn, initials } from '@/lib/utils';

const navigation = [
  { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/tickets', label: 'Conversas', icon: MessageSquareText },
  { href: '/customers', label: 'Clientes', icon: Users },
];

const pageTitles: Record<string, string> = {
  '/dashboard': 'Visão geral',
  '/tickets': 'Conversas',
  '/customers': 'Clientes',
  '/settings': 'Configurações',
};

function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const router = useRouter();

  const signOut = async () => {
    if (!isDemoMode) {
      try { await apiClient.post('/auth/logout'); } catch { /* Session is cleared locally even if logout is unavailable. */ }
    }
    clearSession();
    onNavigate?.();
    router.replace('/login');
    toast.success('Você saiu da sua conta.');
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-[76px] items-center justify-between px-6">
        <Link aria-label="Atende, início" href="/dashboard" onClick={onNavigate}>
          <BrandMark />
        </Link>
        {mobile ? <Button aria-label="Fechar menu" onClick={onNavigate} size="icon-sm" variant="ghost"><X /></Button> : null}
      </div>

      <div className="mx-4 mb-5 rounded-2xl border border-border bg-background px-3 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">{initials(user?.companyName ?? 'Empresa')}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.companyName ?? 'Sua empresa'}</p>
            <p className="text-xs text-muted-foreground">Plano profissional</p>
          </div>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>

      <nav aria-label="Navegação principal" className="flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              href={href}
              onClick={onNavigate}
            >
              <Icon className={cn('size-[18px]', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
              {href === '/tickets' ? <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">fila</span> : null}
            </Link>
          );
        })}

        <p className="px-3 pb-2 pt-8 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Preferências</p>
        <Link
          className={cn(
            'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
            pathname === '/settings' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          href="/settings"
          onClick={onNavigate}
        >
          <Settings2 className="size-[18px]" strokeWidth={1.8} />
          Configurações
        </Link>
      </nav>

      <div className="mx-4 mb-4 rounded-2xl border border-border bg-background p-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><LifeBuoy className="size-4" /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">Precisa de ajuda?</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Acesse nossa central de suporte.</p>
            <button className="mt-2 text-xs font-semibold text-primary hover:underline" type="button" onClick={() => toast.info('A central de ajuda será conectada em breve.')}>Falar com suporte</button>
          </div>
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-9" name={user?.name ?? 'Usuário'} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name ?? 'Usuário'}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</p>
          </div>
          <button aria-label="Sair da conta" className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => void signOut()} type="button">Sair</button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = pageTitles[pathname] ?? 'Atende';
  const user = useAuthStore((state) => state.user);

  return (
    <AuthBoundary>
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-border lg:block">
          <Sidebar />
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button aria-label="Fechar navegação" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} type="button" />
            <aside className="absolute inset-y-0 left-0 w-[min(84vw,320px)] border-r border-border shadow-2xl">
              <Sidebar mobile onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="lg:pl-[260px]">
          <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <Button aria-label="Abrir menu" className="lg:hidden" onClick={() => setMobileOpen(true)} size="icon" variant="ghost"><Menu /></Button>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Atende <span className="px-1 text-border">/</span> Workspace</p>
                <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
              </div>
              {isDemoMode ? <Badge className="hidden sm:inline-flex" variant="warning"><Command className="size-3" /> Demo</Badge> : null}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
              <Button aria-label="Notificações" className="relative text-muted-foreground" onClick={() => toast.info('A central de notificações será conectada aos eventos da API.')} size="icon" variant="ghost">
                <Bell />
                <span className="absolute right-[9px] top-[8px] size-1.5 rounded-full bg-primary ring-2 ring-background" />
              </Button>
              <span className="mx-1 hidden h-7 w-px bg-border sm:block" />
              <Avatar className="size-9" name={user?.name ?? 'Usuário'} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">{children}</main>
        </div>
      </div>
    </AuthBoundary>
  );
}
