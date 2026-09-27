import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { ApplicationRole, AuthenticatedActor } from './authenticated-actor';

interface JwtAccessClaims {
  sub?: unknown;
  companyId?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = new Set<ApplicationRole>(['ADMIN', 'SUPERVISOR', 'AGENT']);

/** Verify an access token and load current tenant membership for HTTP and sockets. */
export async function authenticateAccessToken(
  prisma: PrismaService,
  token: string,
  secret: string,
): Promise<AuthenticatedActor> {
  const claims = verifyAccessToken(token, secret);
  if (
    typeof claims.sub !== 'string' || !UUID_PATTERN.test(claims.sub) ||
    typeof claims.companyId !== 'string' || !UUID_PATTERN.test(claims.companyId)
  ) {
    throw new UnauthorizedException();
  }

  const user = await prisma.user.findFirst({
    where: { id: claims.sub, companyId: claims.companyId, isActive: true },
    select: {
      roles: { select: { role: { select: { code: true } } } },
      departmentMemberships: {
        where: { department: { isActive: true } },
        select: { departmentId: true },
      },
    },
  });
  if (!user) throw new UnauthorizedException();

  const roles = [...new Set(user.roles.map(({ role }) => role.code).filter((role): role is ApplicationRole =>
    ALLOWED_ROLES.has(role as ApplicationRole),
  ))];
  if (roles.length === 0) throw new UnauthorizedException();

  return {
    userId: claims.sub,
    companyId: claims.companyId,
    roles,
    departmentIds: user.departmentMemberships.map(({ departmentId }) => departmentId),
  };
}

function verifyAccessToken(token: string, secret: string): JwtAccessClaims {
  if (!token || token.length > 8_192) throw new UnauthorizedException();
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new UnauthorizedException();

  try {
    const encodedHeader = parts[0]!;
    const encodedClaims = parts[1]!;
    const encodedSignature = parts[2]!;
    const header: unknown = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    const parsedClaims: unknown = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
    if (!isRecord(header) || header.alg !== 'HS256' || !isRecord(parsedClaims)) {
      throw new UnauthorizedException();
    }

    const expected = createHmac('sha256', secret).update(`${encodedHeader}.${encodedClaims}`).digest();
    const actual = Buffer.from(encodedSignature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException();
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = parsedClaims as JwtAccessClaims;
    if (
      typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now ||
      (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now)) ||
      (claims.iat !== undefined && (typeof claims.iat !== 'number' || claims.iat > now + 60))
    ) {
      throw new UnauthorizedException();
    }
    return claims;
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;
    throw new UnauthorizedException();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
