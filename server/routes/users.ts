import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { listUsersPublic, upsertUser, deleteUser, appendAuditLog } from '../repository';
import { hashPassword, supabaseCreateUser, supabaseUpdateUser, supabaseDeleteUser, findUserById } from '../auth';

export function createUsersRouter(): Router {
  const router = Router();

  router.get('/users', requireAuth, requirePermission('admin:users'), async (_req: AuthedRequest, res: Response) => {
    const users = await listUsersPublic();
    res.json(users);
  });

  // Only an administrator can provision users. The initial password is set here
  // via the Supabase admin API and the user is flagged to choose their own
  // password on first login.
  router.post('/users', requireAuth, requirePermission('admin:users'), validateBody(z.object({ id: z.string().optional(), name: z.string().min(1), email: z.string().email().trim(), role: z.string().min(1), bu: z.string().min(1), phone: z.string().optional(), password: z.string().min(8) })), async (req: AuthedRequest, res: Response) => {
    const { id, name, email, role, bu, phone, password } = req.body as { id?: string; name: string; email: string; role: string; bu: string; phone?: string; password: string };
    const userId = id || 'usr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const created = await supabaseCreateUser(email, password, name);
    const passwordHash = hashPassword(password);
    await upsertUser({ id: userId, name, email, role, bu, phone, passwordHash, authUserId: created.id, mustChangePassword: true });
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'USER_CREATED', details: `User ${userId} created` });
    res.status(201).json({ id: userId, name, email, role, bu, phone });
  });

  router.patch('/users/:id', requireAuth, requirePermission('admin:users'), validateBody(z.object({ name: z.string().optional(), email: z.string().email().trim().optional(), role: z.string().optional(), bu: z.string().optional(), phone: z.string().optional(), password: z.string().min(8).optional() })), async (req: AuthedRequest, res: Response) => {
    const patch = req.body as { name?: string; email?: string; role?: string; bu?: string; phone?: string; password?: string };

    // Only SUPER_ADMIN can change roles or assign executive roles
    if (patch.role && patch.role !== req.user!.role) {
      if (req.user!.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only SUPER_ADMIN can change user roles' });
      }
    }

    const current = await findUserById(req.params.id);
    if (current?.auth_user_id) {
      await supabaseUpdateUser(current.auth_user_id, {
        email: patch.email,
        password: patch.password,
        name: patch.name,
      });
    }
    const passwordHash = patch.password ? hashPassword(patch.password) : undefined;
    // An admin resetting the password forces the user to choose a new one.
    const mustChangePassword = patch.password ? true : undefined;
    await upsertUser({ ...patch, id: req.params.id, passwordHash, mustChangePassword });
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'USER_UPDATED', details: `User ${req.params.id} updated` });
    res.json({ ok: true });
  });

  router.delete('/users/:id', requireAuth, requireRoles('SUPER_ADMIN'), async (req: AuthedRequest, res: Response) => {
    const current = await findUserById(req.params.id);
    if (current?.auth_user_id) {
      await supabaseDeleteUser(current.auth_user_id);
    }
    await deleteUser(req.params.id);
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'USER_DELETED', details: `User ${req.params.id} deleted` });
    res.json({ ok: true });
  });

  return router;
}
