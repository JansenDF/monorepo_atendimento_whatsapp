import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

type CorsOrigin = (
  requestOrigin: string | undefined,
  callback: (error: Error | null, origin?: boolean | string | RegExp | (string | RegExp)[]) => void,
) => void;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const config = app.get(ConfigService);
  const socketAdapter = new RedisIoAdapter(app, config);
  await socketAdapter.connectToRedis();
  app.useWebSocketAdapter(socketAdapter);
  const allowedOrigins = (config.get<string>('FRONTEND_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isAllowedOrigin: CorsOrigin = (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed'));
  };
  app.enableCors({
    origin: isAllowedOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  try {
    await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('API bootstrap failed', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
