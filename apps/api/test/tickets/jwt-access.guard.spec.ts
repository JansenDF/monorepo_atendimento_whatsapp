import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../src/database/prisma.service';
import { JwtAccessGuard } from '../../src/common/auth/jwt-access.guard';
import { AuthenticatedRequest } from '../../src/common/auth/authenticated-actor';

const SECRET = 'test-secret-that-is-long-enough-for-hmac-256';
const USER_ID = 'f92d2d37-6b87-490d-80f6-646014b64ad8';
const COMPANY_ID = '0bc78439-60ed-4c02-8a40-1ca73af06402';
const DEPARTMENT_ID = '250c6953-cfb5-441e-8c89-f8a44431ae18';

function signToken(claims: Record<string, unknown>, secret = SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function contextFor(token: string): { context: ExecutionContext; request: AuthenticatedRequest } {
  const request: AuthenticatedRequest = { headers: { authorization: `Bearer ${token}` } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function setup() {
  const config = { get: jest.fn().mockReturnValue(SECRET) } as unknown as ConfigService;
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue({
        roles: [{ role: { code: 'AGENT' } }],
        departmentMemberships: [{ departmentId: DEPARTMENT_ID }],
      }),
    },
  } as unknown as PrismaService;
  return { guard: new JwtAccessGuard(config, prisma), prisma };
}

describe('JwtAccessGuard', () => {
  it('verifies a signed token and loads tenant roles from the database', async () => {
    const { guard, prisma } = setup();
    const token = signToken({ sub: USER_ID, companyId: COMPANY_ID, exp: Math.floor(Date.now() / 1000) + 60 });
    const { context, request } = contextFor(token);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: USER_ID, companyId: COMPANY_ID, isActive: true },
      select: expect.any(Object),
    });
    expect(request.authenticatedActor).toEqual({
      userId: USER_ID,
      companyId: COMPANY_ID,
      roles: ['AGENT'],
      departmentIds: [DEPARTMENT_ID],
    });
  });

  it('rejects expired tokens before performing a database lookup', async () => {
    const { guard, prisma } = setup();
    const token = signToken({ sub: USER_ID, companyId: COMPANY_ID, exp: Math.floor(Date.now() / 1000) - 1 });
    const { context } = contextFor(token);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a validly formed token with an invalid signature', async () => {
    const { guard, prisma } = setup();
    const token = signToken({ sub: USER_ID, companyId: COMPANY_ID, exp: Math.floor(Date.now() / 1000) + 60 }, 'another-secret-that-also-has-enough-bytes');
    const { context } = contextFor(token);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
