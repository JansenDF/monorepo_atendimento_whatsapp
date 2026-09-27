import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient: ReturnType<typeof createClient> | undefined;
  private subClient: ReturnType<typeof createClient> | undefined;
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;

  constructor(app: INestApplication, private readonly config: ConfigService) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    const options = {
      url,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries: number) => Math.min(retries * 250, 5_000),
      },
    };

    this.pubClient = createClient(options);
    this.subClient = this.pubClient.duplicate();
    this.pubClient.on('error', () => this.logger.error('Redis Socket.IO publisher connection error'));
    this.subClient.on('error', () => this.logger.error('Redis Socket.IO subscriber connection error'));

    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    } catch (error) {
      await this.closeRedisClients();
      this.logger.error('Redis Socket.IO adapter could not connect');
      throw error;
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    if (!this.adapterConstructor) throw new Error('Redis Socket.IO adapter is not connected');
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Parameters<IoAdapter['close']>[0]): Promise<void> {
    await super.close(server);
    await this.closeRedisClients();
  }

  private async closeRedisClients(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter(
      (client): client is NonNullable<typeof client> => client !== undefined,
    );
    await Promise.allSettled(clients.map(async (client) => {
      if (client.isOpen) await client.quit();
      else client.disconnect();
    }));
    this.pubClient = undefined;
    this.subClient = undefined;
  }
}
