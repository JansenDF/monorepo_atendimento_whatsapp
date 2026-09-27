import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { WebhookSignatureService } from '../../src/whatsapp/webhook-signature.service';

describe('WebhookSignatureService', () => {
  const secret = 'test-app-secret';
  const config = {
    get: jest.fn(() => secret),
  } as unknown as ConfigService;
  const service = new WebhookSignatureService(config);

  it('accepts a valid Meta HMAC signature over the raw body', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    expect(service.verify(rawBody, signature)).toBe(true);
  });

  it('rejects missing, malformed, and body-mismatched signatures', () => {
    const rawBody = Buffer.from('{"entry":[]}');
    const valid = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    expect(service.verify(undefined, valid)).toBe(false);
    expect(service.verify(rawBody, undefined)).toBe(false);
    expect(service.verify(rawBody, 'sha256=not-a-signature')).toBe(false);
    expect(service.verify(Buffer.from('different body'), valid)).toBe(false);
  });
});
