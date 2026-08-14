import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { listUsersPublic, upsertUser, deleteUser, appendAuditLog } from '../repository';
import { hashPassword, supabaseCreateUser, supabaseUpdateUser, supabaseDeleteUser, findUserById } from '../auth';

export const USER_ROLES = ['SUPER_ADMIN', 'EXECUTIVE', 'BU_SUPPORT', 'BU_SUPPORT_L1', 'BU_SUPPORT_L2', 'BU_SUPPORT_L3', 'PARTNER'] as const;

/** Infer the account type from the role when an explicit value is absent. */
export function inferAccountType(role: string): 'BU' | 'PARTNER' {
  return role === 'PARTNER' ? 'PARTNER' : 'BU';
}

const userSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).trim(),
    email: z.string().trim().toLowerCase(),
    accountType: z.enum(['BU', 'PARTNER']).optional(),
    role: z.enum([...USER_ROLES]),
    bu: z.string().trim().optional().default(''),
    partner: z.string().trim().optional().default(''),
    phone: z.string().trim().optional().default(''),
    password: z.string().min(8),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Validate email has a proper domain with TLD (e.g., user@domain.com)
    const email = v.email;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'Email must have a valid format with domain and TLD (e.g., user@domain.com)',
        });
      }
    }
    const acct = v.accountType ?? inferAccountType(v.role);
    if (acct === 'BU' && !v.bu.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bu'], message: 'Business Unit is required for a BU account' });
    }
    if (acct === 'PARTNER' && !v.partner.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['partner'], message: 'Payment Partner is required for a Payment Partner account' });
    }
    if (acct === 'PARTNER' && v.role !== 'PARTNER') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'Payment Partner accounts must use the PARTNER role' });
    }
    if (acct === 'BU' && v.role === 'PARTNER') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'The PARTNER role requires a Payment Partner account' });
    }
  });

export function createUsersRouter(): Router {
  const router = Router();

  router.get('/users', requireAuth, requirePermission('admin:users'), async (_req: AuthedRequest, res: Response) => {
    const users = await listUsersPublic();
    res.json(users);
  });

  // Only an administrator can provision users. The initial password is set here
  // via the Supabase admin API and the user is flagged to choose their own
  // password on first login.
router.post('/users', requireAuth, requirePermission('admin:users'), validateBody(userSchema), async (req: AuthedRequest, res: Response) => {
    const { id, name, email, role, bu, partner, phone, password, accountType } = req.body as {
      id?: string; name: string; email: string; role: string; bu: string; partner: string; phone?: string; password: string; accountType?: 'BU' | 'PARTNER';
    };
    // Validate role is from schema (not arbitrary input) - role is already validated by schema
    const validatedRole = role;
    const userId = id || 'usr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const resolvedAccountType = accountType ?? inferAccountType(validatedRole);
    const created = await supabaseCreateUser(email, password, name);
    const passwordHash = hashPassword(password);
    const activationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    try {
      await upsertUser({ id: userId, name, email, role: validatedRole, bu, partner, accountType: resolvedAccountType, phone, passwordHash, authUserId: created.id, mustChangePassword: true, isActive: false, activationToken, activatedAt: null });
    } catch (e: any) {
      // Don't leave an orphaned Supabase auth identity if the DB write fails.
      try {
        await supabaseDeleteUser(created.id);
      } catch {
        // best-effort cleanup; the original error is what matters
      }
      throw e;
    }
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'USER_CREATED', details: `User ${userId} created, pending activation` });
    // TODO: Send activation email to user with link containing token
    res.status(201).json({ id: userId, name, email, role, bu, partner, accountType: resolvedAccountType, phone, isActive: false, activationToken });
  });

  router.patch('/users/:id', requireAuth, requirePermission('admin:users'), validateBody(z.object({ name: z.string().optional(), email: z.string().email().trim().optional(), role: z.enum([...USER_ROLES]).optional(), accountType: z.enum(['BU', 'PARTNER']).optional(), bu: z.string().optional(), partner: z.string().optional(), phone: z.string().optional(), password: z.string().min(8).optional() })), async (req: AuthedRequest, res: Response) => {
    const patch = req.body as { name?: string; email?: string; role?: string; accountType?: 'BU' | 'PARTNER'; bu?: string; partner?: string; phone?: string; password?: string };

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
    // If password is being changed and user was pending activation, auto-activate
    const activateOnPasswordChange = patch.password && current?.isActive === false;
    await upsertUser({ ...patch, id: req.params.id, passwordHash, mustChangePassword });
    // Auto-activate if password was changed and user was pending
    if (activateOnPasswordChange) {
      await upsertUser({ id: req.params.id, isActive: true, activationToken: null, activatedAt: new Date().toISOString() });
    }
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'USER_UPDATED', details: `User ${req.params.id} updated` });
    res.json({ ok: true });
  });

  // Super admin can toggle user activation status
  router.patch('/users/:id/activation', requireAuth, requireRoles('SUPER_ADMIN'), validateBody(z.object({ isActive: z.boolean() })), async (req: AuthedRequest, res: Response) => {
    const { isActive } = req.body as { isActive: boolean };
    await upsertUser({ id: req.params.id, isActive, activationToken: null, activatedAt: isActive ? new Date().toISOString() : null });
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'USER_ACTIVATION_TOGGLED', details: `User ${req.params.id} activation toggled to ${isActive} by ${req.user!.name}` });
    res.json({ ok: true, isActive });
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