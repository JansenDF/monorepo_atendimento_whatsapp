import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedActor, AuthenticatedRequest } from './authenticated-actor';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authenticatedActor) throw new UnauthorizedException();
    return request.authenticatedActor;
  },
);
