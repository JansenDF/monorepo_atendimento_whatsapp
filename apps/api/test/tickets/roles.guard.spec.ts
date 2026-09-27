import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedActor, AuthenticatedRequest } from '../../src/common/auth/authenticated-actor';
import { RolesGuard } from '../../src/common/auth/roles.guard';

const actor: AuthenticatedActor = {
  userId: 'f92d2d37-6b87-490d-80f6-646014b64ad8',
  companyId: '0bc78439-60ed-4c02-8a40-1ca73af06402',
  roles: ['AGENT'],
  departmentIds: [],
};

function setup(requiredRoles: string[], requestActor: AuthenticatedActor | undefined = actor) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  const request: AuthenticatedRequest = {
    headers: {},
    ...(requestActor ? { authenticatedActor: requestActor } : {}),
  };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context, reflector };
}

describe('RolesGuard', () => {
  it('allows a principal with one of the required company roles', () => {
    const { guard, context } = setup(['AGENT', 'SUPERVISOR']);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies principals that have none of the required roles', () => {
    const { guard, context } = setup(['ADMIN', 'SUPERVISOR']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows routes without role metadata', () => {
    const { guard, context } = setup([]);

    expect(guard.canActivate(context)).toBe(true);
  });
});
