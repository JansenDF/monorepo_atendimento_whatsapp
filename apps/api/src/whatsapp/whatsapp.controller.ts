import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { WebhookSignatureService } from './webhook-signature.service';
import { WhatsappService } from './whatsapp.service';

interface WebhookRequest {
  body: unknown;
  header(name: string): string | undefined;
}

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly config: ConfigService,
    private readonly signature: WebhookSignatureService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!expected || mode !== 'subscribe' || !this.matchesToken(verifyToken, expected) || !challenge) {
      throw new UnauthorizedException('WhatsApp webhook verification failed');
    }
    return challenge;
  }

  private matchesToken(supplied: string | undefined, expected: string): boolean {
    if (!supplied) return false;
    const suppliedBytes = Buffer.from(supplied, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Req() request: RawBodyRequest<WebhookRequest>,
  ): Promise<{ received: true }> {
    const signature = request.header('x-hub-signature-256');
    if (!this.signature.verify(request.rawBody, signature)) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }
    await this.whatsapp.receiveWebhook(request.body as unknown);
    return { received: true };
  }
}
