import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, findUserByEmail, findUserByAuthId, issueSession, clearSession, supabaseSignIn, toAuthUser, type AuthedRequest } from '../auth';
import { audit, AuditAction } from '../auditEvents';

export function createAuthSessionsRouter(): Router {
  const router = Router();

  // Every login goes through Supabase Auth (signInWithPassword). The app only
  // ever maps the confirmed Supabase identity to a provisioned app user row.
  router.post('/auth/login', validateBody(z.object({ email: z.string().email().trim(), password: z.string().min(1) })), async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const { id: authUserId } = await supabaseSignIn(email, password, ip, userAgent);
      const userRow = (await findUserByAuthId(authUserId)) ?? (await findUserByEmail(email));
      if (!userRow) return res.status(401).json({ error: 'Account not provisioned in app' });
      // A pending-activation account (is_active=false while still awaiting
      // activation — an activation token set, or a legacy provisioned user who
      // has yet to choose a password) may log in with its temporary password so
      // it can choose its own. A suspended account (is_active=false with the
      // token consumed and no forced password change) is hard-blocked.
      const pendingActivation = userRow.is_active === false && (Boolean(userRow.activation_token) || Boolean(userRow.must_change_password));
      if (userRow.is_active === false && !pendingActivation) {
        return res.status(403).json({ error: 'Account suspended' });
      }
      const authUser = toAuthUser(userRow);
      issueSession(res, authUser);
      await audit({ event: 'USER_LOGIN', actor: userRow.name, role: userRow.role, action: AuditAction.USER_LOGIN, details: `User ${userRow.email} logged in` });
      res.json({ user: authUser, mustChangePassword: Boolean(authUser.mustChangePassword) || pendingActivation, pendingActivation });
    } catch (e: any) {
      const msg = e.message || 'Login failed';
      if (msg === 'Invalid credentials') {
        const failedUser = await findUserByEmail(req.body.email || '');
      await audit({ event: 'LOGIN_FAILED', actor: failedUser?.name ?? req.body.email, role: failedUser?.role ?? 'UNKNOWN', action: AuditAction.LOGIN_FAILED, details: `Failed login attempt for ${req.body.email}: invalid credentials` });
        return res.status(401).json({ error: msg });
      }
      if (msg.startsWith('Email not confirmed')) return res.status(403).json({ error: msg });
      if (e.code === 'ACCOUNT_LOCKED') {
        return res.status(423).json({ error: msg, lockedUntil: e.lockedUntil });
      }
      res.status(500).json({ error: msg });
    }
  });

  // Self-registration is intentionally removed: accounts are provisioned only by
  // an administrator, who also sets the initial password and the forced-change flag.

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.user, mustChangePassword: Boolean(req.user?.mustChangePassword) });
  });

  router.post('/auth/logout', requireAuth, async (req: AuthedRequest, res: Response) => {
    await audit({ event: 'USER_LOGOUT', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_LOGOUT, details: `User ${req.user!.email} logged out` });
    clearSession(res);
    res.json({ ok: true });
  });

  return router;
}
