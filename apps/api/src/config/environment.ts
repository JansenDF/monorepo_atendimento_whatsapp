export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface ValidatedEnvironment extends Record<string, unknown> {
  NODE_ENV: RuntimeEnvironment;
  PORT: number;
  DATABASE_URL: string;
}

const runtimeEnvironments: readonly RuntimeEnvironment[] = [
  'development',
  'test',
  'production',
];

export function validateEnvironment(
  source: Record<string, unknown>,
): ValidatedEnvironment {
  const errors: string[] = [];

  const nodeEnvValue = source.NODE_ENV ?? 'development';
  const nodeEnv = runtimeEnvironments.includes(nodeEnvValue as RuntimeEnvironment)
    ? (nodeEnvValue as RuntimeEnvironment)
    : undefined;
  if (!nodeEnv) errors.push('NODE_ENV must be development, test, or production');

  const rawPort = source.PORT ?? '3000';
  const port = typeof rawPort === 'number' ? rawPort : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push('PORT must be an integer between 1 and 65535');
  }

  const rawDatabaseUrl = source.DATABASE_URL;
  const databaseUrl = typeof rawDatabaseUrl === 'string' ? rawDatabaseUrl.trim() : '';
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        parsed.hostname.length === 0
      ) {
        errors.push('DATABASE_URL must be a PostgreSQL connection URL');
      }
    } catch {
      errors.push('DATABASE_URL must be a valid URL');
    }
  }

  if (errors.length > 0 || !nodeEnv) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return {
    ...source,
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
  };
}
