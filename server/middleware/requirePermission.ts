import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from '../auth';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../rbac';
import { getConfig } from '../repository';

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authed = req as AuthedRequest;
    if (!authed.user) return res.status(401).json({ error: 'Authentication required' });
    const cached = (res.locals as any).__roles as ReturnType<typeof getRoles> | undefined;
    if (!cached) {
      const raw = await getConfig<RoleDefinition[]>('roles', []);
      (res.locals as any).__roles = getRoles(raw);
    }
    if (!hasPermissionForRoleId((res.locals as any).__roles, authed.user.role, permission)) {
      return res.status(403).json({ error: `Requires permission: ${permission}` });
    }
    next();
  };
}

/** Return roles from the per-request cache if a requirePermission middleware already
 *  ran in this pipeline. Otherwise return undefined so the caller can fall back
 *  to its own getConfig+getRoles call. */
export function getCachedRoles(res: Response): ReturnType<typeof getRoles> | undefined {
  return (res.locals as any).__roles as ReturnType<typeof getRoles> | undefined;
}