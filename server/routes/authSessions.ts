import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, findUserByEmail, findUserByAuthId, issueSession, clearSession, supabaseSignIn, toAuthUser, type AuthedRequest } from '../auth';

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
      const authUser = toAuthUser(userRow);
      issueSession(res, authUser);
      res.json({ user: authUser, mustChangePassword: Boolean(authUser.mustChangePassword) });
    } catch (e: any) {
      const msg = e.message || 'Login failed';
      if (msg === 'Invalid credentials') return res.status(401).json({ error: msg });
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

  router.post('/auth/logout', (_req: Request, res: Response) => {
    clearSession(res);
    res.json({ ok: true });
  });

  return router;
}
