import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../database/prisma.service';
import { authenticateAccessToken } from '../common/auth/access-token-authenticator';
import { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { TicketService } from '../tickets/ticket.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RealtimeSocket = Socket & {
  data: Socket['data'] & { actor?: AuthenticatedActor };
};

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:3000')
        .split(',')
        .map((configuredOrigin) => configuredOrigin.trim())
        .filter(Boolean);
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed'), false);
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer()
  private server?: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tickets: TicketService,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
    server.use((socket, next) => {
      void this.authenticate(socket as RealtimeSocket).then(
        (actor) => {
          (socket as RealtimeSocket).data.actor = actor;
          next();
        },
        () => next(new Error('Unauthorized')),
      );
    });
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    const actor = client.data.actor;
    if (!actor) {
      client.disconnect(true);
      return;
    }

    try {
      await client.join(this.companyRoom(actor.companyId));
    } catch {
      this.logger.warn('Socket could not join its tenant room');
      client.disconnect(true);
    }
  }

  @SubscribeMessage('ticket:join')
  async joinTicket(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const actor = client.data.actor;
    const ticketId = this.ticketIdFrom(payload);
    if (!actor || !ticketId) {
      client.emit('ticket.error', { message: 'Ticket is unavailable' });
      return;
    }

    try {
      // findById enforces tenant, role, assignment and department access.
      await this.tickets.findById(actor, ticketId);
      await client.join(this.ticketRoom(actor.companyId, ticketId));
      client.emit('ticket.joined', { ticketId });
    } catch {
      client.emit('ticket.error', { message: 'Ticket is unavailable' });
    }
  }

  @SubscribeMessage('ticket:leave')
  async leaveTicket(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const actor = client.data.actor;
    const ticketId = this.ticketIdFrom(payload);
    if (actor && ticketId) await client.leave(this.ticketRoom(actor.companyId, ticketId));
  }

  /** Emits only server-selected, tenant-scoped identifiers; message content stays in REST. */
  publishCompanyEvent(companyId: string, eventName: string, payload: Record<string, string>): boolean {
    if (!this.server) return false;
    this.server.to(this.companyRoom(companyId)).emit(eventName, payload);
    return true;
  }

  publishTicketEvent(
    companyId: string,
    ticketId: string,
    eventName: string,
    payload: Record<string, string>,
  ): boolean {
    if (!this.server) return false;
    this.server.to(this.ticketRoom(companyId, ticketId)).emit(eventName, payload);
    return true;
  }

  private async authenticate(socket: RealtimeSocket): Promise<AuthenticatedActor> {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Socket authentication unavailable');

    const authToken: unknown = socket.handshake.auth?.token;
    const header = socket.handshake.headers.authorization;
    const token = typeof authToken === 'string'
      ? authToken
      : header?.startsWith('Bearer ')
        ? header.slice(7)
        : '';
    return authenticateAccessToken(this.prisma, token, secret);
  }

  private ticketIdFrom(payload: unknown): string | undefined {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
    const ticketId = (payload as Record<string, unknown>).ticketId;
    return typeof ticketId === 'string' && UUID_PATTERN.test(ticketId) ? ticketId : undefined;
  }

  private companyRoom(companyId: string): string {
    return `company:${companyId}`;
  }

  private ticketRoom(companyId: string, ticketId: string): string {
    return `ticket:${companyId}:${ticketId}`;
  }
}
