import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { listUsersPublic, upsertUser, deleteUser } from '../repository';
import { audit, AuditAction } from '../auditEvents';
import { hashPassword, supabaseCreateUser, supabaseUpdateUser, supabaseDeleteUser, findUserById, supabaseSetBan } from '../auth';
import { buildId, buildToken, buildPassword } from '../lib/ids';
import { sendUserInvite } from '../services/emailService';

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
    const userId = id || buildId('usr');
    const resolvedAccountType = accountType ?? inferAccountType(validatedRole);
    const created = await supabaseCreateUser(email, password, name);
    const passwordHash = hashPassword(password);
    const activationToken = buildToken(32);
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
    // Best-effort welcome email with the temporary credentials. A failure is
    // surfaced to the admin (they can resend) but does not roll back the account.
    const invite = await sendUserInvite({
      to: email,
      name,
      email,
      loginUrl: `${req.protocol}://${req.get('host')}/auth/login`,
      tempPassword: password,
      sentBy: req.user!.name,
    });
    await audit({ event: invite.ok ? 'USER_INVITED' : 'USER_INVITE_FAILED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_INVITED, details: `User ${userId} created, pending activation — welcome email ${invite.ok ? 'sent' : `failed (${invite.error || 'unknown'})`}` });
    // NOTE: never return the activation token. The temp password is delivered by
    // email (one-time) and the token is consumed by the change-password flow.
    res.status(201).json({ id: userId, name, email, role, bu, partner, accountType: resolvedAccountType, phone, isActive: false, activationPending: true, invitationSent: invite.ok });
  });

  // Generate a secure temporary password for the admin to provision a new
  // account (and optionally show the user). The password itself is never stored
  // server-side before the user row exists — the admin passes it back on create.
  router.post('/users/generate-password', requireAuth, requirePermission('admin:users'), async (req: AuthedRequest, res: Response) => {
    const password = buildPassword();
    await audit({ event: 'USER_TEMP_PASSWORD_GENERATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_TEMP_PASSWORD_GENERATED, details: `Temporary password generated for a new account by ${req.user!.name}` });
    res.json({ password });
  });

  // Resend the welcome email and rotate the temporary password for a pending
  // user (e.g. the original email was lost or SMTP was down at creation).
  router.post('/users/:id/resend-invite', requireAuth, requireRoles('SUPER_ADMIN'), async (req: AuthedRequest, res: Response) => {
    const current = await findUserById(req.params.id);
    if (!current) return res.status(404).json({ error: 'User not found' });
    const tempPassword = buildPassword();
    const activationToken = buildToken(32);
    if (current.auth_user_id) {
      await supabaseUpdateUser(current.auth_user_id, { password: tempPassword });
    }
    await upsertUser({ id: current.id, passwordHash: hashPassword(tempPassword), mustChangePassword: true, isActive: false, activationToken, activatedAt: null });
    const invite = await sendUserInvite({
      to: current.email,
      name: current.name,
      email: current.email,
      loginUrl: `${req.protocol}://${req.get('host')}/auth/login`,
      tempPassword,
      sentBy: req.user!.name,
    });
    await audit({ event: invite.ok ? 'USER_INVITE_RESENT' : 'USER_INVITE_FAILED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_INVITED, details: `Welcome email re-sent for ${current.email} — ${invite.ok ? 'sent' : `failed (${invite.error || 'unknown'})`}` });
    // The rotated temporary password is returned so a SUPER_ADMIN (this route is
    // SUPER_ADMIN-only) can hand the credentials over manually via the admin UI
    // when SMTP is down. It is never persisted beyond the resend call.
    res.json({ ok: true, invitationSent: invite.ok, tempPassword: invite.ok ? undefined : tempPassword });
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
    await audit({ event: 'USER_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_UPDATED, details: `User ${req.params.id} updated` });
    res.json({ ok: true });
  });

  // Super admin can toggle user activation status. An account can only be
  // suspended once it has completed activation — never while still pending
  // (pending = outstanding activation token or forced password change, the same
  // derivation listUsersPublic uses for the "Pending Activation" status).
  router.patch('/users/:id/activation', requireAuth, requireRoles('SUPER_ADMIN'), validateBody(z.object({ isActive: z.boolean() })), async (req: AuthedRequest, res: Response) => {
    const { isActive } = req.body as { isActive: boolean };
    const current = await findUserById(req.params.id);
    if (!isActive) {
      if (!current) return res.status(404).json({ error: 'User not found' });
      if (current.activation_token || current.must_change_password) {
        return res.status(409).json({ error: 'Cannot suspend an account that has not been activated yet' });
      }
    }
    await upsertUser({ id: req.params.id, isActive, activationToken: null, activatedAt: isActive ? new Date().toISOString() : null });
    if (current?.auth_user_id) {
      await supabaseSetBan(current.auth_user_id, isActive);
    }
    await audit({ event: 'USER_ACTIVATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_ACTIVATED, details: `User ${req.params.id} activation toggled to ${isActive} by ${req.user!.name}` });
    res.json({ ok: true, isActive });
  });

  router.delete('/users/:id', requireAuth, requireRoles('SUPER_ADMIN'), async (req: AuthedRequest, res: Response) => {
    const current = await findUserById(req.params.id);
    if (current?.auth_user_id) {
      await supabaseDeleteUser(current.auth_user_id);
    }
    await deleteUser(req.params.id);
    await audit({ event: 'USER_DELETED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_DELETED, details: `User ${req.params.id} deleted` });
    res.json({ ok: true });
  });

  return router;
}