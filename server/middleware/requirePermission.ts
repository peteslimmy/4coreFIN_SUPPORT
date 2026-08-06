import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from '../auth';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../rbac';
import { getConfig } from '../repository';

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authed = req as AuthedRequest;
    if (!authed.user) return res.status(401).json({ error: 'Authentication required' });
    const roles = getRoles(await getConfig<RoleDefinition[]>('roles', []));
    if (!hasPermissionForRoleId(roles, authed.user.role, permission)) {
      return res.status(403).json({ error: `Requires permission: ${permission}` });
    }
    next();
  };
}
