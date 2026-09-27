import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { authenticateAccessToken } from './access-token-authenticator';
import { AuthenticatedRequest } from './authenticated-actor';

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new ServiceUnavailableException('Ticket authentication is not configured');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException();
    if (authorization.length > 8_200) throw new UnauthorizedException();

    request.authenticatedActor = await authenticateAccessToken(
      this.prisma,
      authorization.slice(7),
      secret,
    );
    return true;
  }
}
