import { Circle, Clock3, CheckCircle2, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TicketStatus } from '@/lib/types';

const statusConfig: Record<TicketStatus, { label: string; variant: 'success' | 'warning' | 'muted' | 'default'; Icon: typeof Circle }> = {
  OPEN: { label: 'Aberto', variant: 'success', Icon: Circle },
  PENDING: { label: 'Pendente', variant: 'warning', Icon: Clock3 },
  WAITING_CUSTOMER: { label: 'Aguardando cliente', variant: 'default', Icon: MessageCircle },
  CLOSED: { label: 'Encerrado', variant: 'muted', Icon: CheckCircle2 },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const config = statusConfig[status];
  return <Badge className="font-medium" variant={config.variant}><config.Icon className="size-3" />{config.label}</Badge>;
}
