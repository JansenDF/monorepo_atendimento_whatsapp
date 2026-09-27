import { MessageStatus, MessageType } from '../generated/prisma/client';

export type WhatsappRecord = Record<string, unknown>;

export interface NormalizedInboundMessage {
  providerMessageId: string;
  sender: string;
  providerTimestamp: string | null;
  type: MessageType;
  body: string | null;
  raw: WhatsappRecord;
  media: {
    id: string;
    mimeType: string;
    sha256: string | null;
    fileName: string | null;
  } | null;
}

export function isRecord(value: unknown): value is WhatsappRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function normalizeInboundMessage(value: unknown): NormalizedInboundMessage | null {
  if (!isRecord(value)) return null;
  const providerMessageId = stringValue(value.id);
  const sender = stringValue(value.from);
  const rawType = stringValue(value.type);
  if (!providerMessageId || !sender || !rawType) return null;

  const typeMap: Record<string, MessageType> = {
    text: 'TEXT',
    image: 'IMAGE',
    document: 'DOCUMENT',
    audio: 'AUDIO',
    video: 'VIDEO',
    location: 'LOCATION',
    sticker: 'STICKER',
  };
  const type = typeMap[rawType] ?? 'UNKNOWN';
  const bodyData = isRecord(value[rawType]) ? value[rawType] : null;
  let body: string | null = null;
  if (rawType === 'text' && bodyData && typeof bodyData.body === 'string') body = bodyData.body;
  else if (bodyData && typeof bodyData.text === 'string') body = bodyData.text;
  else if (bodyData && typeof bodyData.caption === 'string') body = bodyData.caption;
  else if (rawType === 'location' && bodyData) {
    const name = stringValue(bodyData.name);
    const address = stringValue(bodyData.address);
    const latitude = typeof bodyData.latitude === 'number' ? bodyData.latitude : null;
    const longitude = typeof bodyData.longitude === 'number' ? bodyData.longitude : null;
    body = [name, address, latitude !== null && longitude !== null ? `${latitude},${longitude}` : null]
      .filter(Boolean)
      .join(' · ') || null;
  }

  let media: NormalizedInboundMessage['media'] = null;
  if (['image', 'document', 'audio', 'video', 'sticker'].includes(rawType) && bodyData) {
    const mediaId = stringValue(bodyData.id);
    const mimeType = stringValue(bodyData.mime_type);
    if (mediaId && mimeType) {
      media = {
        id: mediaId,
        mimeType,
        sha256: stringValue(bodyData.sha256),
        fileName: stringValue(bodyData.filename),
      };
    }
  }

  return {
    providerMessageId,
    sender,
    providerTimestamp: stringValue(value.timestamp),
    type,
    body,
    raw: value,
    media,
  };
}

export function mapWhatsappStatus(status: string): MessageStatus | null {
  const statuses: Record<string, MessageStatus> = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
  };
  return statuses[status] ?? null;
}

export function shouldAdvanceMessageStatus(current: MessageStatus, next: MessageStatus): boolean {
  const priority: Record<MessageStatus, number> = {
    RECEIVED: 0,
    QUEUED: 0,
    SENT: 1,
    DELIVERED: 2,
    READ: 3,
    FAILED: 4,
  };
  if (current === 'FAILED' || current === 'READ') return false;
  if (next === 'FAILED') return true;
  return priority[next] > priority[current];
}

export function allowedPriorStatuses(next: MessageStatus): MessageStatus[] {
  const allowed: Record<MessageStatus, MessageStatus[]> = {
    RECEIVED: [],
    QUEUED: [],
    SENT: ['QUEUED'],
    DELIVERED: ['QUEUED', 'SENT'],
    READ: ['QUEUED', 'SENT', 'DELIVERED'],
    FAILED: ['QUEUED', 'SENT', 'DELIVERED'],
  };
  return allowed[next];
}
