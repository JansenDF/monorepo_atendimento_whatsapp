import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class WhatsappMediaStorageService implements OnModuleDestroy {
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('WHATSAPP_MEDIA_S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('WHATSAPP_MEDIA_S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('WHATSAPP_MEDIA_S3_SECRET_ACCESS_KEY');
    this.client = new S3Client({
      region: this.config.get<string>('WHATSAPP_MEDIA_S3_REGION') ?? 'us-east-1',
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async store(input: {
    key: string;
    contentType: string;
    body: Uint8Array;
    sha256: string;
  }): Promise<string> {
    const bucket = this.config.get<string>('WHATSAPP_MEDIA_S3_BUCKET');
    if (!bucket) {
      throw new InternalServerErrorException('WhatsApp media object storage is not configured');
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.body.byteLength,
          ChecksumSHA256: Buffer.from(input.sha256, 'hex').toString('base64'),
          ServerSideEncryption: 'AES256',
          Metadata: { sha256: input.sha256 },
        }),
      );
      return `s3://${bucket}/${input.key}`;
    } catch {
      throw new ServiceUnavailableException('WhatsApp media could not be stored');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.destroy();
  }
}
