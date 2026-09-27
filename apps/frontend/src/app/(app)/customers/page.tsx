'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight, CalendarDays, Clock3, Edit3, Mail, MessageSquare, Search, UserRound, X } from 'lucide-react';
import Link from 'next/link';
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
import { customerSchema, CustomerValues } from '@/lib/schemas';
import { useCustomer, useCustomers, useUpdateCustomer } from '@/lib/query-hooks';
import { CustomerDetails, Ticket } from '@/lib/types';
import { formatRelativeTime, formatDateTime } from '@/lib/utils';

function EditCustomerForm({ customer, onCancel, onSaved }: { customer: CustomerDetails; onCancel: () => void; onSaved: () => void }) {
  const form = useForm<CustomerValues>({ resolver: zodResolver(customerSchema), defaultValues: { displayName: customer.displayName, email: customer.email ?? '', notes: customer.notes ?? '' } });
  const mutation = useUpdateCustomer();
  useEffect(() => { form.reset({ displayName: customer.displayName, email: customer.email ?? '', notes: customer.notes ?? '' }); }, [customer, form]);
  const submit = form.handleSubmit(async (values) => {
    try { await mutation.mutateAsync({ customerId: customer.id, values }); toast.success('Cadastro atualizado.'); onSaved(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o cadastro.'); }
  });

  return <form className="space-y-4" onSubmit={submit}>
    <div><label className="mb-1.5 block text-sm font-medium" htmlFor="customer-name">Nome completo</label><Input id="customer-name" {...form.register('displayName')} />{form.formState.errors.displayName ? <p className="mt-1 text-xs text-destructive">{form.formState.errors.displayName.message}</p> : null}</div>
    <div><label className="mb-1.5 block text-sm font-medium" htmlFor="customer-email">E-mail</label><Input id="customer-email" type="email" {...form.register('email')} />{form.formState.errors.email ? <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p> : null}</div>
    <div><label className="mb-1.5 block text-sm font-medium" htmlFor="customer-notes">Observações</label><Textarea id="customer-notes" placeholder="Preferências, contexto ou informações úteis para o atendimento…" {...form.register('notes')} />{form.formState.errors.notes ? <p className="mt-1 text-xs text-destructive">{form.formState.errors.notes.message}</p> : null}</div>
    <div className="flex justify-end gap-2 pt-2"><Button onClick={onCancel} type="button" variant="outline">Cancelar</Button><Button disabled={mutation.isPending} type="submit">{mutation.isPending ? 'Salvando…' : 'Salvar alterações'}</Button></div>
  </form>;
}

function TicketHistory({ ticket }: { ticket: Ticket }) {
  return <Link className="flex items-start gap-3 rounded-xl border border-border p-3 transition hover:bg-accent/50" href={`/tickets?ticket=${ticket.id}`}>
    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MessageSquare className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{ticket.subject}</span><StatusBadge status={ticket.status} /></span><span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{ticket.department?.name ?? 'Sem departamento'}</span><span>{ticket.assignee?.fullName ?? 'Não atribuído'}</span><span>{formatRelativeTime(ticket.updatedAt)}</span></span></span><ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
  </Link>;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearchTerm(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query = useCustomers(searchTerm, page);
  const detailQuery = useCustomer(selectedId);
  const customers = query.data?.items ?? [];
  const detail = detailQuery.data;
  const counts = useMemo(() => ({ total: query.data?.total ?? 0, whatsapp: customers.filter((customer) => customer.contacts.some((contact) => contact.channel === 'WHATSAPP')).length }), [customers, query.data?.total]);

  return <div className="space-y-6">
    <PageHeading eyebrow="Relacionamento" title="Clientes" description="Consulte perfis, contatos e todo o histórico de atendimento." />
    <section className="grid gap-4 sm:grid-cols-2"><Card className="p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><p className="text-xs text-muted-foreground">Clientes encontrados</p><p className="mt-1 text-2xl font-bold">{query.isLoading ? '—' : counts.total}</p></div></div></Card><Card className="p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-success/10 text-success"><MessageSquare className="size-5" /></span><div><p className="text-xs text-muted-foreground">Com WhatsApp nesta página</p><p className="mt-1 text-2xl font-bold">{query.isLoading ? '—' : counts.whatsapp}</p></div></div></Card></section>

    <Card className="overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:px-5"><div><h2 className="text-sm font-semibold">Base de clientes</h2><p className="mt-1 text-xs text-muted-foreground">Busque por nome, e-mail ou telefone.</p></div><div className="relative w-full sm:max-w-[330px]"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar clientes" className="pr-10 pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente..." value={search} />{search ? <button aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')} type="button"><X className="size-4" /></button> : null}</div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Cliente</th><th className="px-4 py-3">Contato</th><th className="px-4 py-3">Conversas</th><th className="px-4 py-3">Cliente desde</th><th className="px-5 py-3 text-right">&nbsp;</th></tr></thead><tbody className="divide-y divide-border">
        {query.isLoading ? [1, 2, 3, 4].map((item) => <tr key={item}><td className="px-5 py-4"><div className="flex items-center gap-3"><Skeleton className="size-10 rounded-full" /><Skeleton className="h-4 w-36" /></div></td><td className="px-4 py-4"><Skeleton className="h-4 w-40" /></td><td className="px-4 py-4"><Skeleton className="h-4 w-10" /></td><td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td><td className="px-5 py-4" /></tr>) : query.error ? <tr><td className="px-5 py-14 text-center text-sm text-destructive" colSpan={5}>Não foi possível carregar os clientes. {query.error.message}</td></tr> : customers.length ? customers.map((customer) => <tr className="transition hover:bg-accent/40" key={customer.id}>
          <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar className="size-10" name={customer.displayName} /><div className="min-w-0"><button className="truncate text-left text-sm font-semibold hover:text-primary" onClick={() => { setSelectedId(customer.id); setEditing(false); }} type="button">{customer.displayName}</button><p className="mt-0.5 truncate text-xs text-muted-foreground">Adicionado {formatRelativeTime(customer.createdAt)}</p></div></div></td>
          <td className="px-4 py-4"><p className="text-sm">{customer.contacts[0]?.address ?? customer.email ?? 'Sem contato'}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">{customer.contacts[0]?.channel === 'WHATSAPP' ? <><span className="size-1.5 rounded-full bg-success" />WhatsApp</> : customer.email ? <><Mail className="size-3" />E-mail</> : '—'}</p></td>
          <td className="px-4 py-4"><Badge variant="secondary">{customer.ticketCount ?? '—'} conversas</Badge></td><td className="px-4 py-4 text-sm text-muted-foreground">{formatDateTime(customer.createdAt, { dateStyle: 'medium', timeStyle: undefined })}</td><td className="px-5 py-4 text-right"><Button aria-label={`Abrir ${customer.displayName}`} onClick={() => setSelectedId(customer.id)} size="icon-sm" variant="ghost"><ArrowUpRight /></Button></td>
        </tr>) : <tr><td className="px-5 py-14 text-center" colSpan={5}><div className="mx-auto max-w-xs"><Search className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-sm font-semibold">Nenhum cliente encontrado</p><p className="mt-1 text-xs text-muted-foreground">Tente outro nome, e-mail ou telefone.</p></div></td></tr>}
      </tbody></table></div>
      {query.data ? <div className="flex flex-col gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted-foreground">Exibindo {customers.length ? (page - 1) * query.data.pageSize + 1 : 0}–{Math.min(page * query.data.pageSize, query.data.total)} de {query.data.total} clientes</span><div className="flex items-center gap-2"><Button disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} size="sm" variant="outline">Anterior</Button><span className="min-w-16 text-center text-xs text-muted-foreground">Página {page} de {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}</span><Button disabled={page * query.data.pageSize >= query.data.total || query.isFetching} onClick={() => setPage((value) => value + 1)} size="sm" variant="outline">Próxima</Button></div></div> : null}
    </Card>

    <Dialog open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setSelectedId(undefined); setEditing(false); } }}><DialogContent className="max-w-2xl p-0">
      {detailQuery.isLoading ? <div className="space-y-4 p-6"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div> : detailQuery.error ? <div className="p-6"><DialogHeader><DialogTitle>Perfil indisponível</DialogTitle><DialogDescription>{detailQuery.error.message}</DialogDescription></DialogHeader><Button onClick={() => setSelectedId(undefined)} variant="outline">Fechar</Button></div> : detail ? <CustomerPanel customer={detail} editing={editing} onEdit={() => setEditing(true)} onCancelEdit={() => setEditing(false)} onSaved={() => setEditing(false)} /> : <div className="p-6 text-sm text-muted-foreground">Selecione um cliente.</div>}
    </DialogContent></Dialog>
  </div>;
}

function CustomerPanel({ customer, editing, onEdit, onCancelEdit, onSaved }: { customer: CustomerDetails; editing: boolean; onEdit: () => void; onCancelEdit: () => void; onSaved: () => void }) {
  return <>
    <div className="flex items-center gap-4 border-b border-border p-6"><Avatar className="size-14 text-base" name={customer.displayName} /><div className="min-w-0 flex-1"><DialogHeader className="mb-0"><DialogTitle className="truncate">{customer.displayName}</DialogTitle><DialogDescription>Cliente desde {formatDateTime(customer.createdAt, { dateStyle: 'long', timeStyle: undefined })}</DialogDescription></DialogHeader></div>{!editing ? <Button className="mr-5" onClick={onEdit} size="sm" variant="outline"><Edit3 /> Editar</Button> : null}</div>
    <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6">
      {editing ? <EditCustomerForm customer={customer} onCancel={onCancelEdit} onSaved={onSaved} /> : <>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-muted/60 p-3.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">E-mail</p><p className="mt-1.5 break-all text-sm font-medium">{customer.email || 'Não informado'}</p></div><div className="rounded-xl bg-muted/60 p-3.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contatos</p>{customer.contacts.length ? customer.contacts.map((contact) => <p className="mt-1.5 flex items-center gap-2 text-sm font-medium" key={contact.id}><Badge variant="success">{contact.channel === 'WHATSAPP' ? 'WhatsApp' : contact.channel}</Badge>{contact.address}</p>) : <p className="mt-1.5 text-sm">Nenhum contato</p>}</div></div>
        {customer.notes ? <div className="rounded-xl border border-border p-4"><p className="text-xs font-semibold">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{customer.notes}</p></div> : null}
        <div><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Histórico de atendimento</h3><p className="mt-1 text-xs text-muted-foreground">{customer.tickets.length} conversas vinculadas a este perfil</p></div><Badge variant="secondary"><CalendarDays className="size-3" /> Histórico completo</Badge></div>
          <div className="space-y-2">{customer.tickets.length ? customer.tickets.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((ticket) => <TicketHistory key={ticket.id} ticket={ticket} />) : <div className="rounded-xl border border-dashed border-border px-4 py-9 text-center"><Clock3 className="mx-auto mb-2 size-5 text-muted-foreground" /><p className="text-sm font-medium">Nenhuma conversa registrada</p><p className="mt-1 text-xs text-muted-foreground">O histórico aparecerá aqui conforme os atendimentos acontecerem.</p></div>}</div>
        </div>
      </>}
    </div>
  </>;
}
