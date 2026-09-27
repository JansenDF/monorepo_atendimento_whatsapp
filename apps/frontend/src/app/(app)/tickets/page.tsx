'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, CheckCheck, Circle, Clock3, Headphones, LoaderCircle, MessageSquare, Paperclip, Send, SlidersHorizontal, UserRound, UsersRound, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { useAuthStore } from '@/lib/auth-store';
import { messageSchema, MessageValues, transferSchema, TransferValues } from '@/lib/schemas';
import { useAssumeTicket, useAgents, useCloseTicket, useDepartments, useReopenTicket, useSendTicketMessage, useTicket, useTickets, useTransferTicket } from '@/lib/query-hooks';
import { useTicketRealtime } from '@/hooks/use-ticket-realtime';
import { Ticket, TicketStatus } from '@/lib/types';
import { formatRelativeTime, formatTime } from '@/lib/utils';

const filters: Array<{ value: TicketStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todas' }, { value: 'OPEN', label: 'Abertas' }, { value: 'PENDING', label: 'Pendentes' },
  { value: 'WAITING_CUSTOMER', label: 'Aguardando' }, { value: 'CLOSED', label: 'Encerradas' },
];

function TicketRow({ ticket, active, onClick }: { ticket: Ticket; active: boolean; onClick: () => void }) {
  const lastMessage = ticket.messages?.at(-1);
  return (
    <button className={`w-full border-b border-border/70 px-4 py-3.5 text-left transition hover:bg-accent/60 ${active ? 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]' : ''}`} onClick={onClick} type="button">
      <div className="flex gap-3"><Avatar className="mt-0.5 size-10" name={ticket.customer.displayName} /><div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{ticket.customer.displayName}</p><span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(ticket.updatedAt)}</span></div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{lastMessage?.body ?? ticket.subject}</p>
        <div className="mt-2 flex items-center gap-1.5"><StatusBadge status={ticket.status} /><span className="truncate text-[10px] text-muted-foreground">{ticket.department?.name ?? 'Sem departamento'}</span><span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{ticket._count?.messages ?? ticket.messages?.length ?? 0}</span></div>
      </div></div>
    </button>
  );
}

function TransferDialog({ ticket, open, onOpenChange }: { ticket: Ticket | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const departments = useDepartments(open);
  const form = useForm<TransferValues>({ resolver: zodResolver(transferSchema), defaultValues: { departmentId: ticket?.department?.id ?? '', assigneeId: '' } });
  const departmentId = form.watch('departmentId');
  const agents = useAgents(departmentId, open && Boolean(departmentId));
  const mutation = useTransferTicket();
  useEffect(() => { form.reset({ departmentId: ticket?.department?.id ?? '', assigneeId: '' }); }, [form, ticket?.id, ticket?.department?.id, open]);
  const submit = form.handleSubmit(async (values) => {
    if (!ticket) return;
    try {
      await mutation.mutateAsync({ ticketId: ticket.id, departmentId: values.departmentId, assigneeId: values.assigneeId || undefined });
      toast.success('Conversa transferida.'); onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível transferir a conversa.'); }
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>Transferir conversa</DialogTitle><DialogDescription>Escolha a equipe e, opcionalmente, a pessoa responsável por esta conversa.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={submit}>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="transfer-department">Departamento</label><select className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50" id="transfer-department" {...form.register('departmentId')}><option value="">Selecione um departamento</option>{(departments.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>{form.formState.errors.departmentId ? <p className="mt-1 text-xs text-destructive">{form.formState.errors.departmentId.message}</p> : null}{departments.error ? <p className="mt-1 text-xs text-destructive">Departamentos indisponíveis. Verifique a API.</p> : null}</div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="transfer-agent">Responsável <span className="font-normal text-muted-foreground">(opcional)</span></label><select className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50" disabled={!departmentId} id="transfer-agent" {...form.register('assigneeId')}><option value="">Deixar na fila do departamento</option>{(agents.data ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select>{agents.error ? <p className="mt-1 text-xs text-destructive">Não foi possível carregar os agentes.</p> : null}</div>
      <div className="flex justify-end gap-2 pt-2"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancelar</Button><Button disabled={mutation.isPending || departments.isLoading} type="submit">{mutation.isPending ? <LoaderCircle className="animate-spin" /> : <UsersRound />} Transferir</Button></div>
    </form>
  </DialogContent></Dialog>;
}

export default function TicketsPage() {
  const [filter, setFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [initialSelectionSet, setInitialSelectionSet] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [search, setSearch] = useState('');
  const list = useTickets({ pageSize: 50, ...(filter !== 'ALL' ? { status: filter } : {}) });
  const tickets = list.data?.items ?? [];
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('ticket');
    if (wanted && !initialSelectionSet) {
      setSelectedId(wanted);
      setInitialSelectionSet(true);
    } else if (!initialSelectionSet && tickets.length) {
      setSelectedId(tickets[0]!.id);
      setInitialSelectionSet(true);
    }
  }, [initialSelectionSet, tickets]);
  const detail = useTicket(selectedId);
  const selected = detail.data ?? tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const connection = useTicketRealtime(selectedId);
  const close = useCloseTicket();
  const reopen = useReopenTicket();
  const assume = useAssumeTicket();
  const send = useSendTicketMessage();
  const user = useAuthStore((state) => state.user);
  const canTransfer = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPERVISOR'));
  const canAssume = Boolean(user?.roles.includes('AGENT'));
  const form = useForm<MessageValues>({ resolver: zodResolver(messageSchema), defaultValues: { body: '' } });
  const filteredTickets = useMemo(() => {
    const value = search.trim().toLocaleLowerCase('pt-BR');
    return tickets.filter((ticket) => !value || ticket.customer.displayName.toLocaleLowerCase('pt-BR').includes(value) || ticket.subject.toLocaleLowerCase('pt-BR').includes(value));
  }, [search, tickets]);

  const runAction = async (action: 'close' | 'reopen' | 'assume') => {
    if (!selected) return;
    try {
      if (action === 'close') await close.mutateAsync(selected.id);
      if (action === 'reopen') await reopen.mutateAsync(selected.id);
      if (action === 'assume') await assume.mutateAsync(selected.id);
      toast.success(action === 'close' ? 'Conversa encerrada.' : action === 'reopen' ? 'Conversa reaberta.' : 'Você assumiu a conversa.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'A ação não foi concluída.'); }
  };
  const submitMessage = form.handleSubmit(async ({ body }) => {
    if (!selected) return;
    try { await send.mutateAsync({ ticketId: selected.id, body }); form.reset(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.'); }
  });

  return <div className="space-y-5">
    <PageHeading eyebrow="Central de atendimento" title="Conversas" description="Acompanhe e responda seus clientes em um só lugar." actions={<div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${connection === 'connected' || connection === 'demo' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{connection === 'connected' || connection === 'demo' ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}{connection === 'demo' ? 'Demonstração' : connection === 'connected' ? 'Tempo real conectado' : connection === 'connecting' ? 'Conectando…' : 'Atualização periódica'}</div>} />
    <Card className="grid min-h-[650px] overflow-hidden lg:h-[calc(100vh-235px)] lg:min-h-[580px] lg:grid-cols-[310px_minmax(0,1fr)_250px] xl:grid-cols-[340px_minmax(0,1fr)_280px]">
      <aside className={`flex min-h-0 flex-col border-r border-border ${selected ? 'hidden lg:flex' : 'flex'}`}>
        <div className="border-b border-border p-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Caixa de entrada</h2><p className="mt-1 text-xs text-muted-foreground">{list.data?.total ?? '—'} conversas</p></div><Button aria-label="Filtros de conversa" size="icon-sm" variant="ghost" onClick={() => toast.info('Filtros avançados serão habilitados pela API.')}><SlidersHorizontal /></Button></div>
          <div className="relative mt-4"><MessageSquare className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar conversas" className="h-10 pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa..." value={search} /></div>
          <div aria-label="Filtrar conversas por situação" className="scrollbar-subtle mt-3 flex gap-1 overflow-x-auto pb-1">{filters.map((item) => <button aria-pressed={filter === item.value} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${filter === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}</div>
        </div>
        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto" role="list">
          {list.isLoading ? [1, 2, 3, 4].map((i) => <div className="flex gap-3 border-b border-border p-4" key={i}><Skeleton className="size-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-full" /></div></div>) : list.error ? <div className="p-5 text-sm text-destructive">Não foi possível carregar as conversas. {list.error.message}</div> : filteredTickets.length ? filteredTickets.map((ticket) => <TicketRow active={selectedId === ticket.id} key={ticket.id} onClick={() => setSelectedId(ticket.id)} ticket={ticket} />) : <div className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>}
        </div>
      </aside>

      <section className={`flex min-w-0 flex-col ${!selected ? 'hidden lg:flex' : 'flex'}`}>
        {selected ? <>
          <header className="flex min-h-[72px] items-center gap-3 border-b border-border px-4 sm:px-5"><Button aria-label="Voltar à lista" className="lg:hidden" onClick={() => setSelectedId(undefined)} size="icon-sm" variant="ghost">←</Button><Avatar className="size-10" name={selected.customer.displayName} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold">{selected.customer.displayName}</h2><StatusBadge status={selected.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{selected.contact?.address ?? selected.subject}</p></div>
            {selected.status !== 'CLOSED' ? <>{canTransfer ? <Button aria-label="Transferir conversa" className="hidden sm:inline-flex" onClick={() => setTransferOpen(true)} size="sm" variant="outline"><UsersRound /> Transferir</Button> : null}<Button aria-label="Encerrar conversa" className="hidden sm:inline-flex" disabled={close.isPending} onClick={() => void runAction('close')} size="sm" variant="outline"><Check /> Encerrar</Button><Button aria-label="Encerrar conversa" className="sm:hidden" disabled={close.isPending} onClick={() => void runAction('close')} size="icon-sm" variant="outline"><Check /></Button></> : <><Button className="hidden sm:inline-flex" disabled={reopen.isPending} onClick={() => void runAction('reopen')} size="sm" variant="outline">Reabrir</Button><Button aria-label="Reabrir conversa" className="sm:hidden" disabled={reopen.isPending} onClick={() => void runAction('reopen')} size="icon-sm" variant="outline"><Check /></Button></>}
            {selected.status !== 'CLOSED' && canTransfer ? <Button aria-label="Transferir conversa" className="sm:hidden" onClick={() => setTransferOpen(true)} size="icon-sm" variant="ghost"><UsersRound /></Button> : null}
            {selected.status !== 'CLOSED' && canAssume && !selected.assignee ? <Button aria-label="Assumir conversa" className="sm:hidden" disabled={assume.isPending} onClick={() => void runAction('assume')} size="icon-sm" variant="ghost"><UserRound /></Button> : null}
          </header>
          <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-muted/25 px-4 py-5 sm:px-7">
            <div className="mt-auto space-y-4">
              <div className="mx-auto my-3 flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] text-muted-foreground"><Clock3 className="size-3" />Conversa iniciada {formatRelativeTime(selected.createdAt)}</div>
              {detail.isLoading ? <div className="space-y-4"><Skeleton className="h-16 w-2/3" /><Skeleton className="ml-auto h-16 w-2/3" /></div> : (selected.messages ?? []).map((message) => {
                const outbound = message.direction !== 'INBOUND';
                return <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`} key={message.id}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[76%] ${outbound ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card'}`}>
                  {message.direction === 'INTERNAL' ? <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">Nota interna</p> : null}
                  {message.body ? <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p> : <p className="italic opacity-70">Mensagem com anexo</p>}
                  <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] ${outbound ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}><span>{message.author?.fullName ?? (outbound ? 'Equipe' : selected.customer.displayName)}</span><span>·</span><span>{formatTime(message.createdAt)}</span>{outbound ? <CheckCheck className="size-3" /> : null}</div>
                </div></div>;
              })}
            </div>
          </div>
          <div className="border-t border-border bg-card p-3 sm:p-4">
            {selected.status === 'CLOSED' ? <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3"><p className="text-sm text-muted-foreground">Esta conversa está encerrada.</p><Button onClick={() => void runAction('reopen')} size="sm">Reabrir conversa</Button></div> : <form onSubmit={submitMessage}>
              <div className="rounded-2xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring/30"><Textarea aria-label="Escreva uma mensagem" className="min-h-[66px] resize-none border-0 bg-transparent px-2 py-1 shadow-none focus-visible:ring-0" disabled={send.isPending} placeholder="Escreva sua resposta..." {...form.register('body')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} />
                <div className="flex items-center justify-between px-1 pt-1"><div className="flex items-center gap-1"><Button aria-label="Anexar arquivo" onClick={() => toast.info('Envio de anexos será liberado quando a API disponibilizar esse fluxo.')} size="icon-sm" type="button" variant="ghost"><Paperclip /></Button><span className="hidden text-[10px] text-muted-foreground sm:block">Enter para enviar · Shift + Enter para nova linha</span></div><Button aria-label="Enviar mensagem" disabled={send.isPending || !form.watch('body')?.trim()} size="sm" type="submit">{send.isPending ? <LoaderCircle className="animate-spin" /> : <Send />} Enviar</Button></div>
              </div>{form.formState.errors.body ? <p className="mt-1 text-xs text-destructive">{form.formState.errors.body.message}</p> : null}
            </form>}
          </div>
        </> : <div className="grid flex-1 place-items-center p-6 text-center"><div><div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><MessageSquare className="size-6" /></div><h2 className="font-semibold">Escolha uma conversa</h2><p className="mt-1 text-sm text-muted-foreground">Selecione um cliente na lista para ver o histórico.</p></div></div>}
      </section>

      <aside className="hidden min-h-0 flex-col border-l border-border xl:flex">
        {selected ? <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-5"><div className="flex flex-col items-center border-b border-border pb-5 text-center"><Avatar className="size-16 text-base" name={selected.customer.displayName} /><h3 className="mt-3 text-sm font-semibold">{selected.customer.displayName}</h3><p className="mt-1 text-xs text-muted-foreground">{selected.contact?.address ?? 'Contato não informado'}</p><Badge className="mt-3" variant="success"><Circle className="size-2 fill-current" /> WhatsApp</Badge></div>
          <div className="space-y-4 border-b border-border py-5"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhes</h4><div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted"><Headphones className="size-4 text-muted-foreground" /></span><div><p className="text-[10px] text-muted-foreground">Departamento</p><p className="mt-0.5 text-xs font-medium">{selected.department?.name ?? 'Sem departamento'}</p></div></div><div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted"><UserRound className="size-4 text-muted-foreground" /></span><div className="min-w-0"><p className="text-[10px] text-muted-foreground">Responsável</p><p className="mt-0.5 truncate text-xs font-medium">{selected.assignee?.fullName ?? 'Não atribuído'}</p></div></div><div className="flex items-start gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted"><MessageSquare className="size-4 text-muted-foreground" /></span><div><p className="text-[10px] text-muted-foreground">Assunto</p><p className="mt-0.5 text-xs font-medium">{selected.subject}</p></div></div></div>
          <div className="space-y-3 py-5"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações rápidas</h4>{selected.status !== 'CLOSED' ? <>{canTransfer ? <Button className="w-full justify-start" onClick={() => setTransferOpen(true)} size="sm" variant="outline"><UsersRound /> Transferir equipe</Button> : null}{canAssume && (!selected.assignee || selected.assignee.id === user?.id) ? <Button className="w-full justify-start" disabled={assume.isPending || selected.assignee?.id === user?.id} onClick={() => void runAction('assume')} size="sm" variant="outline"><UserRound /> {selected.assignee?.id === user?.id ? 'Você está atendendo' : 'Assumir conversa'}</Button> : null}<Button className="w-full justify-start" disabled={close.isPending} onClick={() => void runAction('close')} size="sm" variant="outline"><Check /> Encerrar conversa</Button></> : <Button className="w-full" onClick={() => void runAction('reopen')} size="sm">Reabrir conversa</Button>}</div>
        </div> : <div className="grid flex-1 place-items-center p-5 text-center text-xs text-muted-foreground">Os detalhes do cliente aparecem aqui.</div>}
      </aside>
    </Card>
    <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} ticket={selected} />
  </div>;
}
