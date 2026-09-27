import { SetMetadata } from '@nestjs/common';
import { ApplicationRole } from './authenticated-actor';

export const REQUIRED_ROLES = 'required_roles';
export const RequireRoles = (...roles: ApplicationRole[]) => SetMetadata(REQUIRED_ROLES, roles);
