import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class WebhookSignatureService {
  constructor(private readonly config: ConfigService) {}

  verify(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!rawBody || !signature || !appSecret || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      return false;
    }

    const received = Buffer.from(signature.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', appSecret).update(rawBody).digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}
