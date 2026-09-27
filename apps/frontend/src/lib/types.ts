export type TicketStatus = 'OPEN' | 'PENDING' | 'WAITING_CUSTOMER' | 'CLOSED';
export type TicketChannel = 'WHATSAPP' | 'WEBCHAT' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'OTHER';
export type MessageDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  companyName: string;
  roles: Array<'ADMIN' | 'SUPERVISOR' | 'AGENT'>;
}

export interface AuthSessionResponse {
  accessToken: string;
  user: AuthUser;
}

export interface TicketMessage {
  id: string;
  direction: MessageDirection;
  type: string;
  status: string;
  body: string | null;
  createdAt: string;
  author?: { id: string; fullName: string } | null;
  attachments?: Array<{ id: string; fileName: string | null; mimeType: string; byteSize: number }>;
}

export interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  channel: TicketChannel;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  customer: { id: string; displayName: string };
  contact?: { id: string; address: string; displayName?: string | null; channel: TicketChannel } | null;
  department?: { id: string; name: string } | null;
  assignee?: { id: string; fullName: string; email?: string } | null;
  messages?: TicketMessage[];
  _count?: { messages: number };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketMetrics {
  period: { from: string; to: string };
  averageFirstResponseSeconds: number | null;
  averageHandlingSeconds: number | null;
  ticketsByAgent: Array<{ agentId: string | null; agentName: string | null; count: number }>;
  ticketsByDepartment: Array<{ departmentId: string | null; departmentName: string | null; count: number }>;
}

export type TicketStatusCounts = Record<TicketStatus, number>;

export interface Customer {
  id: string;
  displayName: string;
  email: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  contacts: Array<{ id: string; channel: TicketChannel; address: string; isPrimary?: boolean }>;
  ticketCount?: number;
}

export interface CustomerDetails extends Customer {
  tickets: Ticket[];
}

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface AgentOption {
  id: string;
  fullName: string;
  departmentId?: string;
}
