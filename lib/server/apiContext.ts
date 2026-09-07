import { NextRequest, NextResponse } from 'next/server';
import { getRoles, hasPermissionForRoleId, type Permission } from '../../shared/rbac';
import { getConfig } from '../../server/repository';
import { requireSession, type SessionContext } from './session';

/**
 * Permission check for route handlers (permission-only model — role-string
 * gates were removed per the audit). Loads the role definitions from config
 * and evaluates the shared RBAC model.
 */
export async function hasPermission(userRole: string, permission: Permission): Promise<boolean> {
  const raw = await getConfig<import('../../shared/rbac').RoleDefinition[]>('roles', []);
  return hasPermissionForRoleId(getRoles(raw), userRole, permission);
}

export type Guard = { session: SessionContext } | NextResponse;

/**
 * Combined auth + permission guard:
 *   const guard = await guardRequest(req, 'tickets:view');
 *   if (guard instanceof NextResponse) return guard;
 *   // guard.session.user is available here
 */
export async function guardRequest(req: NextRequest, permission?: Permission): Promise<Guard> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  if (permission) {
    const allowed = await hasPermission(session.user.role, permission);
    if (!allowed) {
      return NextResponse.json({ error: `Requires permission: ${permission}` }, { status: 403 });
    }
  }
  return { session };
}

export function containsMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('•');
}
