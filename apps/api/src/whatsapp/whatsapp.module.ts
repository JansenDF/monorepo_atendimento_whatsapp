import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { WhatsappCloudApiClient } from './whatsapp-cloud-api.client';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappCredentialsCipher } from './whatsapp-credentials-cipher';
import { WhatsappMediaStorageService } from './whatsapp-media-storage.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [AiModule],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WhatsappCloudApiClient,
    WhatsappCredentialsCipher,
    WhatsappMediaStorageService,
    WebhookSignatureService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
