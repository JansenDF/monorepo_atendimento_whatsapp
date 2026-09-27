'use client';

import { Bell, Check, ChevronRight, Globe2, Laptop, Moon, Palette, ShieldCheck, Sun, UserRound, Wifi } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { PageHeading } from '@/components/page-heading';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';
import { isDemoMode } from '@/lib/demo-mode';

type Preferences = { newTickets: boolean; assignedTickets: boolean; sound: boolean };
const preferenceDefaults: Preferences = { newTickets: true, assignedTickets: true, sound: false };

function readPreferences(): Preferences {
  if (typeof window === 'undefined') return preferenceDefaults;
  try {
    const value = window.localStorage.getItem('atende:preferences');
    return value ? { ...preferenceDefaults, ...JSON.parse(value) as Partial<Preferences> } : preferenceDefaults;
  } catch {
    return preferenceDefaults;
  }
}

function subscribeToHydration() {
  return () => {};
}

function PreferenceToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 py-3"><span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}><input aria-label={label} checked={checked} className="peer sr-only" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} /></span></label>;
}

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const { theme, setTheme } = useTheme();
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const updatePreference = (key: keyof Preferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    window.localStorage.setItem('atende:preferences', JSON.stringify(next));
    toast.success('Preferência salva neste dispositivo.');
  };

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace" title="Configurações" description="Personalize seu espaço de trabalho e suas preferências." />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(290px,0.8fr)]">
      <div className="space-y-5">
        <Card className="p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><h2 className="text-sm font-semibold">Seu perfil</h2><p className="mt-1 text-xs text-muted-foreground">Informações da sua conta de atendimento.</p></div></div><div className="flex items-center gap-4 rounded-2xl bg-muted/60 p-4"><Avatar className="size-12" name={user?.name ?? 'Usuário'} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user?.name ?? 'Usuário'}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email}</p></div><Badge variant="success">{user?.roles[0] ?? 'AGENT'}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-3.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Empresa</p><p className="mt-1.5 text-sm font-medium">{user?.companyName ?? 'Sua empresa'}</p></div><div className="rounded-xl border border-border p-3.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Acesso</p><p className="mt-1.5 text-sm font-medium">Controle gerenciado pelo administrador</p></div></div><p className="mt-4 text-xs text-muted-foreground">Para alterar nome, e-mail ou senha, solicite acesso ao administrador da sua empresa.</p></Card>

        <Card className="p-5 sm:p-6"><div className="mb-3 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-warning/15 text-warning"><Bell className="size-5" /></span><div><h2 className="text-sm font-semibold">Notificações</h2><p className="mt-1 text-xs text-muted-foreground">Preferências salvas neste navegador. A entrega depende da integração de notificações da empresa.</p></div></div><div className="divide-y divide-border">{ready ? <><PreferenceToggle checked={preferences.newTickets} description="Preferência para avisos quando uma conversa entrar na fila." label="Novas conversas" onChange={(value) => updatePreference('newTickets', value)} /><PreferenceToggle checked={preferences.assignedTickets} description="Preferência para avisos quando uma conversa for atribuída a você." label="Conversas atribuídas a mim" onChange={(value) => updatePreference('assignedTickets', value)} /><PreferenceToggle checked={preferences.sound} description="Preferência para reproduzir som nas notificações da central." label="Som de notificação" onChange={(value) => updatePreference('sound', value)} /></> : <div className="h-28" />}</div></Card>
      </div>

      <div className="space-y-5">
        <Card className="p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-chart-4/10 text-chart-4"><Palette className="size-5" /></span><div><h2 className="text-sm font-semibold">Aparência</h2><p className="mt-1 text-xs text-muted-foreground">Ajuste a forma como o painel é exibido.</p></div></div><p className="mb-3 text-xs font-medium text-muted-foreground">Tema</p><div className="grid grid-cols-3 gap-2">{([{ value: 'light', label: 'Claro', icon: Sun }, { value: 'dark', label: 'Escuro', icon: Moon }, { value: 'system', label: 'Sistema', icon: Laptop }] as const).map(({ value, label, icon: Icon }) => <button aria-pressed={theme === value} className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition ${theme === value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`} key={value} onClick={() => setTheme(value)} type="button"><Icon className="size-4" />{label}{theme === value ? <Check className="size-3" /> : <span className="h-3" />}</button>)}</div><div className="mt-4 flex items-center justify-between rounded-xl bg-muted/60 p-3"><span className="text-xs text-muted-foreground">Alternar tema rapidamente</span><ThemeToggle /></div></Card>

        <Card className="p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-success/10 text-success"><ShieldCheck className="size-5" /></span><div><h2 className="text-sm font-semibold">Conexões e segurança</h2><p className="mt-1 text-xs text-muted-foreground">Status dos serviços deste workspace.</p></div></div><div className="space-y-3"><div className="flex items-center justify-between rounded-xl border border-border p-3"><span className="flex items-center gap-2 text-xs font-medium"><Wifi className="size-4 text-success" /> API de atendimento</span><Badge variant={isDemoMode ? 'warning' : 'success'}>{isDemoMode ? 'Demonstração' : 'Configurada'}</Badge></div><div className="flex items-center justify-between rounded-xl border border-border p-3"><span className="flex items-center gap-2 text-xs font-medium"><Globe2 className="size-4 text-muted-foreground" /> Idioma e região</span><span className="text-xs text-muted-foreground">Português (Brasil)</span></div></div><Button className="mt-4 w-full justify-between" onClick={() => toast.info('A gestão de integrações fica disponível para administradores.')} variant="outline">Integrações da empresa <ChevronRight /></Button></Card>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5"><p className="text-sm font-semibold">Atende <span className="font-normal text-muted-foreground">· Painel de atendimento</span></p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Ajuda sua equipe a cuidar de cada conversa com contexto, colaboração e agilidade.</p><p className="mt-4 text-[10px] text-muted-foreground">Versão do painel 0.1.0</p></div>
      </div>
    </div>
  </div>;
}
