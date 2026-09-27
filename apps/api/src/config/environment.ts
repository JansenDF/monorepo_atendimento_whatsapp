export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface ValidatedEnvironment extends Record<string, unknown> {
  NODE_ENV: RuntimeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL?: string;
  JWT_ACCESS_SECRET?: string;
  AI_ENABLED: boolean;
  AI_PROVIDER?: 'OPENAI' | 'AZURE_OPENAI';
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

  const jwtAccessSecret = source.JWT_ACCESS_SECRET;
  if (jwtAccessSecret !== undefined && jwtAccessSecret !== '') {
    if (typeof jwtAccessSecret !== 'string' || Buffer.byteLength(jwtAccessSecret, 'utf8') < 32) {
      errors.push('JWT_ACCESS_SECRET must contain at least 32 bytes');
    }
  }

  const rawRedisUrl = source.REDIS_URL;
  const redisUrl = typeof rawRedisUrl === 'string' ? rawRedisUrl.trim() : '';
  if (!redisUrl && nodeEnv !== 'test') {
    errors.push('REDIS_URL is required for the Socket.IO Redis adapter');
  } else if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
        errors.push('REDIS_URL must be a Redis connection URL');
      }
    } catch {
      errors.push('REDIS_URL must be a valid URL');
    }
  }

  const rawAiEnabled = source.AI_ENABLED ?? 'false';
  const aiEnabled = rawAiEnabled === true || rawAiEnabled === 'true';
  if (rawAiEnabled !== true && rawAiEnabled !== false && rawAiEnabled !== 'true' && rawAiEnabled !== 'false') {
    errors.push('AI_ENABLED must be true or false');
  }
  const rawAiProvider = source.AI_PROVIDER ?? 'OPENAI';
  const aiProvider = rawAiProvider === 'OPENAI' || rawAiProvider === 'AZURE_OPENAI'
    ? rawAiProvider
    : undefined;
  if (rawAiProvider !== undefined && !aiProvider) {
    errors.push('AI_PROVIDER must be OPENAI or AZURE_OPENAI');
  }
  if (aiEnabled && aiProvider === 'OPENAI') {
    if (typeof source.OPENAI_API_KEY !== 'string' || source.OPENAI_API_KEY.trim().length < 16) {
      errors.push('OPENAI_API_KEY is required when AI_PROVIDER is OPENAI');
    }
    if (typeof source.OPENAI_MODEL !== 'string' || !source.OPENAI_MODEL.trim()) {
      errors.push('OPENAI_MODEL is required when AI_PROVIDER is OPENAI');
    }
  }
  if (aiEnabled && aiProvider === 'AZURE_OPENAI') {
    if (typeof source.AZURE_OPENAI_API_KEY !== 'string' || source.AZURE_OPENAI_API_KEY.trim().length < 16) {
      errors.push('AZURE_OPENAI_API_KEY is required when AI_PROVIDER is AZURE_OPENAI');
    }
    if (typeof source.AZURE_OPENAI_DEPLOYMENT !== 'string' || !source.AZURE_OPENAI_DEPLOYMENT.trim()) {
      errors.push('AZURE_OPENAI_DEPLOYMENT is required when AI_PROVIDER is AZURE_OPENAI');
    }
    const endpoint = typeof source.AZURE_OPENAI_ENDPOINT === 'string' ? source.AZURE_OPENAI_ENDPOINT.trim() : '';
    try {
      const parsed = new URL(endpoint);
      if (
        parsed.protocol !== 'https:' ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        errors.push('AZURE_OPENAI_ENDPOINT must be a valid HTTPS URL');
      }
    } catch {
      errors.push('AZURE_OPENAI_ENDPOINT must be a valid HTTPS URL');
    }
  }

  const graphApiVersion = source.WHATSAPP_GRAPH_API_VERSION;
  if (
    graphApiVersion !== undefined && graphApiVersion !== '' &&
    (typeof graphApiVersion !== 'string' || !/^v\d+\.\d+$/.test(graphApiVersion))
  ) {
    errors.push('WHATSAPP_GRAPH_API_VERSION must use the Graph API format vNN.N');
  }

  const encryptionKey = source.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
  if (encryptionKey !== undefined && encryptionKey !== '') {
    if (typeof encryptionKey !== 'string') {
      errors.push('WHATSAPP_CREDENTIALS_ENCRYPTION_KEY must be a string');
    } else {
      const isHex = /^[0-9a-f]{64}$/i.test(encryptionKey);
      const decoded = Buffer.from(encryptionKey, 'base64');
      const isBase64 = decoded.length === 32 && decoded.toString('base64') === encryptionKey;
      if (!isHex && !isBase64) {
        errors.push('WHATSAPP_CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hex or base64 value');
      }
    }
  }

  const storageBucket = source.WHATSAPP_MEDIA_S3_BUCKET;
  const storageAccessKey = source.WHATSAPP_MEDIA_S3_ACCESS_KEY_ID;
  const storageSecret = source.WHATSAPP_MEDIA_S3_SECRET_ACCESS_KEY;
  if ((storageAccessKey && !storageSecret) || (!storageAccessKey && storageSecret)) {
    errors.push('WhatsApp media S3 access key and secret must be configured together');
  }
  if (storageBucket !== undefined && storageBucket !== '' && (typeof storageBucket !== 'string' || !storageBucket.trim())) {
    errors.push('WHATSAPP_MEDIA_S3_BUCKET must be a non-empty bucket name');
  }

  if (errors.length > 0 || !nodeEnv) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return {
    ...source,
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    AI_ENABLED: aiEnabled,
    ...(aiProvider ? { AI_PROVIDER: aiProvider } : {}),
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    ...(typeof jwtAccessSecret === 'string' && jwtAccessSecret.length > 0
      ? { JWT_ACCESS_SECRET: jwtAccessSecret }
      : {}),
  };
}
