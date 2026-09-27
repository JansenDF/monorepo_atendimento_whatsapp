export type ApplicationRole = 'ADMIN' | 'SUPERVISOR' | 'AGENT';

export interface AuthenticatedActor {
  userId: string;
  companyId: string;
  roles: ApplicationRole[];
  departmentIds: string[];
}

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  authenticatedActor?: AuthenticatedActor;
}
