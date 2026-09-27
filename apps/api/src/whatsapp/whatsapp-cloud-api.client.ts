import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { WHATSAPP_MAX_MEDIA_BYTES } from './whatsapp.constants';

export interface CloudMessageResponse {
  messages?: Array<{ id?: string }>;
}

export interface DownloadedMedia {
  bytes: Buffer;
  contentType: string;
  sha256Hex: string;
  byteSize: number;
}

export class WhatsappGraphApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly providerCode: string | null,
    readonly retryable: boolean,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'WhatsappGraphApiError';
  }
}

interface GraphErrorPayload {
  error?: { message?: string; code?: number; is_transient?: boolean };
}

@Injectable()
export class WhatsappCloudApiClient {
  constructor(private readonly config: ConfigService) {}

  async sendMessage(
    phoneNumberId: string,
    accessToken: string,
    message: Record<string, unknown>,
  ): Promise<{ providerMessageId: string; attempts: number }> {
    const result = await this.requestJson<CloudMessageResponse>(
      `${this.graphBaseUrl()}/${encodeURIComponent(phoneNumberId)}/messages`,
      accessToken,
      { method: 'POST', body: JSON.stringify(message) },
    );
    const providerMessageId = result.payload.messages?.[0]?.id;
    if (!providerMessageId) {
      throw new BadGatewayException('WhatsApp Cloud API returned no message identifier');
    }
    return { providerMessageId, attempts: result.attempts };
  }

  async downloadMedia(input: {
    mediaId: string;
    accessToken: string;
    expectedMimeType?: string;
    expectedSha256?: string;
  }): Promise<DownloadedMedia> {
    const details = await this.requestJson<{ url?: string; mime_type?: string; file_size?: number | string }>(
      `${this.graphBaseUrl()}/${encodeURIComponent(input.mediaId)}`,
      input.accessToken,
      { method: 'GET' },
    );
    const mediaUrl = details.payload.url;
    if (!mediaUrl || !this.isMetaMediaUrl(mediaUrl)) {
      throw new BadGatewayException('WhatsApp Cloud API returned an invalid media URL');
    }

    const mimeType = (input.expectedMimeType ?? details.payload.mime_type ?? '').split(';', 1)[0]?.trim() ?? '';
    if (!mimeType || mimeType.includes('\r') || mimeType.includes('\n')) {
      throw new BadGatewayException('WhatsApp media did not include a valid content type');
    }
    const declaredSize = Number(details.payload.file_size ?? 0);
    if (Number.isFinite(declaredSize) && declaredSize > WHATSAPP_MAX_MEDIA_BYTES) {
      throw new BadGatewayException('WhatsApp media exceeds the configured size limit');
    }

    let response: Response;
    try {
      response = await fetch(mediaUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.accessToken}` },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException('WhatsApp media download failed');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`WhatsApp media download returned HTTP ${response.status}`);
    }

    const actualContentType = (response.headers.get('content-type') ?? '').split(';', 1)[0]?.trim() ?? '';
    if (actualContentType && actualContentType !== mimeType) {
      throw new BadGatewayException('WhatsApp media content type did not match its metadata');
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > WHATSAPP_MAX_MEDIA_BYTES) {
      throw new BadGatewayException('WhatsApp media exceeds the configured size limit');
    }

    const bytes = await this.readLimitedBody(response);
    if (bytes.byteLength === 0) {
      throw new BadGatewayException('WhatsApp media download returned an empty file');
    }
    const sha256Hex = createHash('sha256').update(bytes).digest('hex');
    if (input.expectedSha256) {
      const expected = input.expectedSha256.trim();
      const actualBase64 = Buffer.from(sha256Hex, 'hex').toString('base64');
      if (expected !== actualBase64 && expected.toLowerCase() !== sha256Hex) {
        throw new BadGatewayException('WhatsApp media checksum verification failed');
      }
    }

    return { bytes, contentType: mimeType, sha256Hex, byteSize: bytes.byteLength };
  }

  private async requestJson<T>(
    url: string,
    accessToken: string,
    init: RequestInit,
  ): Promise<{ payload: T; attempts: number }> {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        // A network timeout can occur after Meta accepted the POST. Retrying it could send duplicates.
        throw new ServiceUnavailableException('WhatsApp Cloud API request failed before a response');
      }

      const payload: unknown = await response.json().catch(() => ({}));
      if (response.ok) return { payload: payload as T, attempts: attempt };

      const graphError = this.parseError(payload);
      const retryable = response.status === 429 || response.status >= 500 || graphError.transient;
      if (retryable && attempt < maxAttempts) {
        await this.wait(this.retryDelay(attempt, response.headers.get('retry-after')));
        continue;
      }

      throw new WhatsappGraphApiError(
        graphError.message,
        response.status,
        graphError.code === null ? null : String(graphError.code),
        retryable,
        attempt,
      );
    }
    throw new InternalServerErrorException('WhatsApp Cloud API retry policy ended unexpectedly');
  }

  private parseError(payload: unknown): { message: string; code: number | null; transient: boolean } {
    const error =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as GraphErrorPayload).error
        : undefined;
    return {
      message: typeof error?.message === 'string' ? error.message : 'WhatsApp Cloud API request failed',
      code: typeof error?.code === 'number' ? error.code : null,
      transient: error?.is_transient === true,
    };
  }

  private retryDelay(attempt: number, retryAfter: string | null): number {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      const retryAt = Number.isFinite(seconds)
        ? Date.now() + seconds * 1_000
        : Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) {
        return Math.min(30_000, Math.max(0, retryAt - Date.now()));
      }
    }
    const exponential = Math.min(5_000, 250 * 2 ** (attempt - 1));
    return exponential + Math.floor(Math.random() * Math.max(1, exponential / 2));
  }

  private async wait(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  private async readLimitedBody(response: Response): Promise<Buffer> {
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > WHATSAPP_MAX_MEDIA_BYTES) {
          await reader.cancel();
          throw new BadGatewayException('WhatsApp media exceeds the configured size limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
  }

  private isMetaMediaUrl(value: string): boolean {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      const allowedHost =
        hostname === 'fbsbx.com' || hostname.endsWith('.fbsbx.com') ||
        hostname === 'fbcdn.net' || hostname.endsWith('.fbcdn.net');
      return url.protocol === 'https:' && allowedHost && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  private graphBaseUrl(): string {
    const version = this.config.get<string>('WHATSAPP_GRAPH_API_VERSION');
    if (!version || !/^v\d+\.\d+$/.test(version)) {
      throw new InternalServerErrorException('WHATSAPP_GRAPH_API_VERSION must be configured, e.g. vXX.0');
    }
    return `https://graph.facebook.com/${version}`;
  }
}
