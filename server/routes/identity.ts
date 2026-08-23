import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { audit, AuditAction } from '../auditEvents';
import {
  listRoles, getRoleById, createRole, updateRole,
  listPermissions, getRolePermissions, setRolePermissions,
  getUserRoles, assignUserRole, removeUserRole,
} from '../identityService';
import { buildId } from '../lib/ids';

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  role_type: z.enum(['system', 'custom']).optional().default('custom'),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const setPermissionsSchema = z.object({
  permissionCodes: z.array(z.string()),
});

const assignRoleSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().uuid(),
});

export function createIdentityRouter(): Router {
  const router = Router();

  // ── Roles CRUD ────────────────────────────────────────────────

  router.get('/identity/roles', requireAuth, requirePermission('admin:access'),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const roles = await listRoles();
        res.json(roles);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/identity/roles/:id', requireAuth, requirePermission('admin:access'),
    async (req: AuthedRequest, res: Response) => {
      const role = await getRoleById(req.params.id);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      const permissions = await getRolePermissions(role.id);
      res.json({ ...role, permissions });
    }
  );

  router.post('/identity/roles', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createRoleSchema),
    async (req: AuthedRequest, res: Response) => {
      try {
        const role = await createRole(req.body);
        await audit({ event: 'IDENTITY_ROLE_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.ROLES_UPDATED, details: `Role ${role.name} created` });
        res.status(201).json(role);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  router.patch('/identity/roles/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(updateRoleSchema),
    async (req: AuthedRequest, res: Response) => {
      try {
        await updateRole(req.params.id, req.body);
        await audit({ event: 'IDENTITY_ROLE_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.ROLES_UPDATED, details: `Role ${req.params.id} updated` });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ── Permissions ───────────────────────────────────────────────

  router.get('/identity/permissions', requireAuth, requirePermission('admin:access'),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const perms = await listPermissions();
        res.json(perms);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ── Role-Permission management ────────────────────────────────

  router.get('/identity/roles/:id/permissions', requireAuth, requirePermission('admin:access'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const perms = await getRolePermissions(req.params.id);
        res.json(perms);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.put('/identity/roles/:id/permissions', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(setPermissionsSchema),
    async (req: AuthedRequest, res: Response) => {
      try {
        await setRolePermissions(req.params.id, req.body.permissionCodes);
        await audit({ event: 'IDENTITY_ROLE_PERMISSIONS_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.ROLES_UPDATED, details: `Permissions updated for role ${req.params.id}` });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ── User-Role management ──────────────────────────────────────

  router.get('/identity/users/:userId/roles', requireAuth, requirePermission('admin:access'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const roles = await getUserRoles(req.params.userId);
        res.json(roles);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.post('/identity/user-roles', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(assignRoleSchema),
    async (req: AuthedRequest, res: Response) => {
      try {
        await assignUserRole(req.body.userId, req.body.roleId, req.user!.id);
        await audit({ event: 'IDENTITY_USER_ROLE_ASSIGNED', actor: req.user!.name, role: req.user!.role, action: AuditAction.ROLES_UPDATED, details: `Role assigned to user ${req.body.userId}` });
        res.status(201).json({ ok: true });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  router.delete('/identity/user-roles/:userId/:roleId', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      try {
        await removeUserRole(req.params.userId, req.params.roleId);
        await audit({ event: 'IDENTITY_USER_ROLE_REMOVED', actor: req.user!.name, role: req.user!.role, action: AuditAction.ROLES_UPDATED, details: `Role removed from user ${req.params.userId}` });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  return router;
}
