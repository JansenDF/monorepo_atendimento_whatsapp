'use client';

import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, Headset, MessageSquareText, Timer, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from 'recharts';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth-store';
import { useTicketMetrics, useTicketStatusCounts, useTickets } from '@/lib/query-hooks';
import { formatDuration, formatRelativeTime } from '@/lib/utils';

function KpiCard({ label, value, hint, icon: Icon, trend, pending }: { label: string; value: string; hint: string; icon: typeof Clock3; trend?: 'up' | 'down'; pending?: boolean }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-[18px]" /></span></div>
        {pending ? <Skeleton className="mt-4 h-8 w-24" /> : <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">{trend ? trend === 'up' ? <ArrowUpRight className="size-3.5 text-success" /> : <ArrowDownRight className="size-3.5 text-success" /> : null}<span>{hint}</span></div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const canViewMetrics = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPERVISOR'));
  const metrics = useTicketMetrics(canViewMetrics);
  const statusCounts = useTicketStatusCounts();
  const ticketQuery = useTickets({ pageSize: 50 });
  const tickets = ticketQuery.data?.items ?? [];
  const activeTickets = tickets.filter((ticket) => ticket.status !== 'CLOSED');
  const responseSeconds = metrics.data?.averageFirstResponseSeconds;
  const handlingSeconds = metrics.data?.averageHandlingSeconds;
  const statusChart = [
    { name: 'Abertas', tickets: statusCounts.data?.OPEN ?? 0 },
    { name: 'Pendentes', tickets: statusCounts.data?.PENDING ?? 0 },
    { name: 'Aguardando', tickets: statusCounts.data?.WAITING_CUSTOMER ?? 0 },
    { name: 'Encerradas', tickets: statusCounts.data?.CLOSED ?? 0 },
  ];
  const agentChart = useMemo(() => metrics.data?.ticketsByAgent.map((item) => ({ name: item.agentName?.split(' ')[0] ?? 'Sem agente', tickets: item.count })) ?? [], [metrics.data]);
  const departmentChart = useMemo(() => metrics.data?.ticketsByDepartment.map((item) => ({ name: item.departmentName ?? 'Sem setor', tickets: item.count })) ?? [], [metrics.data]);
  const queryError = (canViewMetrics && metrics.error) || ticketQuery.error || statusCounts.error;

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Seu time está pronto para atender" title="Visão geral" description="Acompanhe o ritmo do atendimento e cuide das conversas que precisam de você." actions={<Link className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-semibold transition hover:bg-accent" href="/tickets">Abrir conversas <ArrowRight className="size-4" /></Link>} />
      {queryError ? <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">Não foi possível atualizar todos os indicadores. Confira a conexão com a API e tente recarregar.</div> : null}

      <section aria-label="Indicadores de atendimento" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={MessageSquareText} label="Conversas ativas" value={statusCounts.isLoading ? '—' : statusCounts.data ? String(statusCounts.data.OPEN + statusCounts.data.PENDING + statusCounts.data.WAITING_CUSTOMER) : '—'} hint="Contagem total por situação" pending={statusCounts.isLoading} />
        <KpiCard icon={Timer} label="1ª resposta média" value={responseSeconds == null ? '—' : formatDuration(responseSeconds)} hint={canViewMetrics ? 'Nos últimos 30 dias' : 'Indicador para supervisores'} trend="down" pending={metrics.isLoading} />
        <KpiCard icon={Clock3} label="Tempo de atendimento" value={handlingSeconds == null ? '—' : formatDuration(handlingSeconds)} hint={canViewMetrics ? 'Média até a resolução' : 'Indicador para supervisores'} trend="down" pending={metrics.isLoading} />
        <KpiCard icon={Headset} label="Agentes com tickets" value={metrics.data ? String(metrics.data.ticketsByAgent.filter((agent) => agent.count > 0).length) : '—'} hint={canViewMetrics ? 'Com conversas no período' : 'Indicador para supervisores'} pending={metrics.isLoading} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between"><div><CardTitle>Fila por situação</CardTitle><CardDescription className="mt-1">Distribuição dos tickets carregados</CardDescription></div><Badge variant="success"><span className="size-1.5 rounded-full bg-current" /> API</Badge></CardHeader>
          <CardContent className="h-[270px] px-2 pb-4 sm:px-5">
            {statusCounts.isLoading ? <Skeleton className="h-full w-full" /> : statusCounts.error ? <p className="grid h-full place-items-center text-sm text-muted-foreground">Não foi possível carregar a distribuição.</p> : <ResponsiveContainer height="100%" width="100%"><BarChart data={statusChart} margin={{ left: -18, right: 8, top: 12, bottom: 0 }}><CartesianGrid className="chart-grid" strokeDasharray="4 5" vertical={false} /><XAxis axisLine={false} className="chart-axis" dataKey="name" tickLine={false} /><YAxis axisLine={false} className="chart-axis" allowDecimals={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: 'var(--border)', backgroundColor: 'var(--card)', color: 'var(--foreground)' }} /><Bar dataKey="tickets" fill="var(--chart-1)" name="Conversas" radius={[6, 6, 0, 0]} barSize={34} /></BarChart></ResponsiveContainer>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Conversas por agente</CardTitle><CardDescription>Distribuição no período selecionado</CardDescription></CardHeader>
          <CardContent className="h-[270px] px-3 pb-5">
            {canViewMetrics && metrics.isLoading ? <div className="space-y-4 px-2">{[1, 2, 3, 4].map((i) => <Skeleton className="h-7 w-full" key={i} />)}</div> : !canViewMetrics ? <div className="grid h-full place-items-center px-5 text-center text-sm text-muted-foreground">Indicadores detalhados disponíveis para supervisores e administradores.</div> : agentChart.length ? <ResponsiveContainer height="100%" width="100%"><BarChart data={agentChart} layout="vertical" margin={{ left: 4, right: 10, top: 2, bottom: 0 }}><CartesianGrid className="chart-grid" horizontal={false} strokeDasharray="4 5" /><XAxis axisLine={false} className="chart-axis" type="number" tickLine={false} /><YAxis axisLine={false} className="chart-axis" dataKey="name" type="category" tickLine={false} width={62} /><Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ borderRadius: 12, borderColor: 'var(--border)', backgroundColor: 'var(--card)', color: 'var(--foreground)' }} /><Bar dataKey="tickets" fill="var(--chart-1)" name="Conversas" radius={[0, 6, 6, 0]} barSize={18} /></BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-muted-foreground">Sem dados de agentes neste período.</div>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Precisa de atenção</CardTitle><CardDescription className="mt-1">Conversas abertas com atividade recente</CardDescription></div><Link className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground" href="/tickets">Ver todas <ArrowRight className="size-4" /></Link></CardHeader>
          <CardContent className="space-y-1">
            {ticketQuery.isLoading ? [1, 2, 3].map((i) => <Skeleton className="h-[66px] w-full" key={i} />) : activeTickets.length ? activeTickets.slice(0, 4).map((ticket) => <Link className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-accent" href={`/tickets?ticket=${ticket.id}`} key={ticket.id}>
              <Avatar name={ticket.customer.displayName} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{ticket.customer.displayName}</p><StatusBadge status={ticket.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{ticket.subject}</p></div><span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{formatRelativeTime(ticket.updatedAt)}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>) : <div className="py-9 text-center"><div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-success/10 text-success"><MessageSquareText className="size-5" /></div><p className="text-sm font-medium">Tudo em dia</p><p className="mt-1 text-xs text-muted-foreground">Nenhuma conversa ativa no momento.</p></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tickets por departamento</CardTitle><CardDescription>Distribuição de tickets por equipe</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            {!canViewMetrics ? <div className="py-9 text-center text-sm text-muted-foreground">Indicadores detalhados disponíveis para supervisores e administradores.</div> : metrics.isLoading ? [1, 2, 3].map((i) => <Skeleton className="h-10 w-full" key={i} />) : departmentChart.length ? departmentChart.map((department, index) => {
              const max = Math.max(...departmentChart.map((item) => item.tickets), 1);
              return <div key={department.name}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{department.name}</span><span className="text-muted-foreground">{department.tickets}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((department.tickets / max) * 100, 5)}%`, opacity: 1 - index * 0.12 }} /></div></div>;
            }) : <p className="py-9 text-center text-sm text-muted-foreground">Sem dados por departamento.</p>}
            <div className="rounded-xl bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground"><UsersRound className="mr-1.5 inline size-3.5 text-primary" />A distribuição usa os dados dos últimos 30 dias retornados pela API.</div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
