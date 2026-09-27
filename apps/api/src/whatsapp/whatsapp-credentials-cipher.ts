import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

interface WhatsappCredentials {
  accessToken: string;
}

@Injectable()
export class WhatsappCredentialsCipher {
  constructor(private readonly config: ConfigService) {}

  encrypt(credentials: WhatsappCredentials): Buffer {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.from(
      ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.'),
      'utf8',
    );
  }

  decrypt(ciphertext: Uint8Array, keyVersion: string | null): WhatsappCredentials {
    if (keyVersion !== 'v1') {
      throw new InternalServerErrorException('Unsupported WhatsApp credential key version');
    }

    try {
      const [version, ivEncoded, tagEncoded, dataEncoded, ...extra] = Buffer.from(ciphertext)
        .toString('utf8')
        .split('.');
      if (version !== 'v1' || !ivEncoded || !tagEncoded || !dataEncoded || extra.length > 0) {
        throw new Error('Invalid credential envelope');
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getKey(),
        Buffer.from(ivEncoded, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(dataEncoded, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const parsed: unknown = JSON.parse(plaintext);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('accessToken' in parsed) ||
        typeof parsed.accessToken !== 'string' ||
        parsed.accessToken.length === 0
      ) {
        throw new Error('Invalid credential payload');
      }
      return { accessToken: parsed.accessToken };
    } catch {
      throw new InternalServerErrorException('WhatsApp integration credentials could not be decrypted');
    }
  }

  private getKey(): Buffer {
    const encoded = this.config.get<string>('WHATSAPP_CREDENTIALS_ENCRYPTION_KEY');
    if (!encoded) {
      throw new InternalServerErrorException('WhatsApp credential encryption key is not configured');
    }

    const key = /^[0-9a-f]{64}$/i.test(encoded)
      ? Buffer.from(encoded, 'hex')
      : Buffer.from(encoded, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'WHATSAPP_CREDENTIALS_ENCRYPTION_KEY must encode exactly 32 bytes',
      );
    }
    return key;
  }
}
