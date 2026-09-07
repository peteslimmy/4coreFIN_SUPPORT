import { NextRequest, NextResponse } from 'next/server';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../../../../shared/rbac';
import { getConfig } from '../../../../server/repository';
import { buildBootstrapJobs, executeBootstrapJobs, resolveBootstrapRoles } from '../../../../server/services/bootstrapService';
import { requireSession } from '../../../../lib/server/session';

/**
 * GET /api/bootstrap — the app's single highest-traffic endpoint: called on
 * every page load. Permission-filtered, scope-selectable, concurrent job
 * execution (identical behavior to the Express implementation, reusing the
 * same service so both servers stay in behavioral lockstep).
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const user = session.user;

  const roleConfig = await getConfig<RoleDefinition[]>('roles', []);
  const roles = getRoles(roleConfig);
  const can = (permission: Permission) => hasPermissionForRoleId(roles, user.role, permission);

  const scope = req.nextUrl.searchParams.get('scope')?.split(',').map((s) => s.trim()).filter(Boolean) || null;

  const jobs = buildBootstrapJobs({ user, scope, roles, can });
  const data = await executeBootstrapJobs(jobs);

  const rolesData = resolveBootstrapRoles({
    cachedRoles: null,
    roleConfig,
    wantsRoles: !scope || scope.includes('roles'),
  });
  if (rolesData) data.roles = rolesData;

  return NextResponse.json(data);
}
