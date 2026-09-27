import {
  mapWhatsappStatus,
  allowedPriorStatuses,
  normalizeInboundMessage,
  shouldAdvanceMessageStatus,
} from '../../src/whatsapp/whatsapp-payload.mapper';

describe('WhatsApp webhook payload mapping', () => {
  it('normalizes text messages and ignores malformed envelopes', () => {
    expect(
      normalizeInboundMessage({
        id: 'wamid.1',
        from: '5511999999999',
        timestamp: '1770000000',
        type: 'text',
        text: { body: 'Olá' },
      }),
    ).toMatchObject({
      providerMessageId: 'wamid.1',
      sender: '5511999999999',
      type: 'TEXT',
      body: 'Olá',
      media: null,
    });
    expect(normalizeInboundMessage({ id: 'wamid.missing-sender', type: 'text' })).toBeNull();
  });

  it('captures media metadata without trusting optional fields', () => {
    expect(
      normalizeInboundMessage({
        id: 'wamid.image',
        from: '5511999999999',
        type: 'image',
        image: { id: 'media-1', mime_type: 'image/jpeg', sha256: 'digest', caption: 'foto' },
      }),
    ).toMatchObject({
      type: 'IMAGE',
      body: 'foto',
      media: { id: 'media-1', mimeType: 'image/jpeg', sha256: 'digest' },
    });
  });

  it('maps provider statuses and prevents a stale callback from regressing delivery', () => {
    expect(mapWhatsappStatus('delivered')).toBe('DELIVERED');
    expect(mapWhatsappStatus('unknown')).toBeNull();
    expect(shouldAdvanceMessageStatus('QUEUED', 'READ')).toBe(true);
    expect(shouldAdvanceMessageStatus('READ', 'SENT')).toBe(false);
    expect(shouldAdvanceMessageStatus('DELIVERED', 'FAILED')).toBe(true);
    expect(allowedPriorStatuses('READ')).toEqual(['QUEUED', 'SENT', 'DELIVERED']);
  });
});
