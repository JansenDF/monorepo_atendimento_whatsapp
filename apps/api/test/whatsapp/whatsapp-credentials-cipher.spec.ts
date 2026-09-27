import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { WhatsappCredentialsCipher } from '../../src/whatsapp/whatsapp-credentials-cipher';

describe('WhatsappCredentialsCipher', () => {
  const key = Buffer.from('0123456789abcdef0123456789abcdef').toString('hex');
  const config = {
    get: jest.fn(() => key),
  } as unknown as ConfigService;
  const cipher = new WhatsappCredentialsCipher(config);

  it('encrypts access tokens and decrypts them without storing plaintext', () => {
    const encrypted = cipher.encrypt({ accessToken: 'long-lived-meta-token' });

    expect(encrypted.toString('utf8')).not.toContain('long-lived-meta-token');
    expect(cipher.decrypt(encrypted, 'v1')).toEqual({ accessToken: 'long-lived-meta-token' });
  });

  it('rejects unsupported key versions and tampered ciphertext', () => {
    const encrypted = cipher.encrypt({ accessToken: 'long-lived-meta-token' });
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;

    expect(() => cipher.decrypt(encrypted, 'v2')).toThrow(InternalServerErrorException);
    expect(() => cipher.decrypt(tampered, 'v1')).toThrow(InternalServerErrorException);
  });
});
