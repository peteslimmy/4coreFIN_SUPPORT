import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, type AuthedRequest, hashPassword, supabaseSignIn, supabaseUpdateUser, findUserByEmail, findUserById } from '../auth';
import { uploadFile } from '../services/storageService';
import { upsertUser } from '../repository';
import { audit, AuditAction } from '../auditEvents';
import { supabase } from '../supabase';

export function createProfileRouter(): Router {
  const router = Router();

  // ── Get current user profile ─────────────────────────────────
  router.get('/profile', requireAuth, async (req: AuthedRequest, res) => {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.user!.id)
      .single();

    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, role, bu, phone')
      .eq('id', req.user!.id)
      .single();

    res.json({
      ...user,
      profile: profile || {
        avatar_url: null,
        display_name: user?.name || '',
        title: '',
        bio: '',
        timezone: 'Africa/Lagos',
        locale: 'en-NG',
      },
    });
  });

  // ── Update profile ───────────────────────────────────────────
  router.put('/profile', requireAuth, async (req: AuthedRequest, res) => {
    const { display_name, title, bio, timezone, locale, name, phone } = req.body;

    // Update user table fields
    if (name || phone) {
      await supabase.from('users').update({
        ...(name && { name }),
        ...(phone && { phone }),
      }).eq('id', req.user!.id);
    }

    // Upsert profile
    const { error } = await supabase.from('user_profiles').upsert({
      user_id: req.user!.id,
      ...(display_name !== undefined && { display_name }),
      ...(title !== undefined && { title }),
      ...(bio !== undefined && { bio }),
      ...(timezone && { timezone }),
      ...(locale && { locale }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) return res.status(500).json({ error: error.message });

    await audit({ event: 'USER_PROFILE_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_PROFILE_UPDATED, details: `Profile updated by ${req.user!.name}` });
    res.json({ ok: true });
  });

  // ── Upload avatar ────────────────────────────────────────────
  router.post('/profile/avatar', requireAuth, async (req: AuthedRequest, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || 'image/png';
        const url = await uploadFile(buffer, 'avatar.png', contentType, 'avatars');
        if (!url) return res.status(500).json({ error: 'Upload failed' });

        await supabase.from('user_profiles').upsert({
          user_id: req.user!.id,
          avatar_url: url,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        res.json({ url });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  // ── Verify current password ──────────────────────────────────
  // Confirms the password against Supabase Auth (the single source of truth).
  router.post('/auth/verify-password', requireAuth, async (req: AuthedRequest, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    try {
      await supabaseSignIn(req.user!.email, password);
      res.json({ valid: true });
    } catch {
      res.json({ valid: false });
    }
  });

  // ── Change password ──────────────────────────────────────────
  // Authenticated users change their password: verify the current one against
  // Supabase Auth, then update the Supabase identity and clear the forced-change
  // flag on the app user row.
  router.post('/auth/change-password', requireAuth, async (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords required' });
    }

    try {
      await supabaseSignIn(req.user!.email, currentPassword);
    } catch {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const current = await findUserById(req.user!.id);
    const newHash = hashPassword(newPassword);
    const update: any = { passwordHash: newHash, mustChangePassword: false };
    // A pending-activation user completes their activation here: the temp
    // password is replaced with their own, the one-time token is consumed, and
    // the account flips to active. Legacy provisioned users (inactive, forced
    // change, but no token) are treated the same so they don't regress to
    // "Suspended" after choosing their password.
    if (current?.activation_token || (current?.is_active === false && current?.must_change_password)) {
      update.isActive = true;
      update.activationToken = null;
      update.activatedAt = new Date().toISOString();
    }
    if (current?.auth_user_id) {
      await supabaseUpdateUser(current.auth_user_id, { password: newPassword });
    }
    await upsertUser({ id: req.user!.id, ...update });
    await audit({ event: 'USER_PASSWORD_CHANGED', actor: req.user!.name, role: req.user!.role, action: AuditAction.USER_PASSWORD_CHANGED, details: `Password changed by ${req.user!.name}` });
    res.json({ ok: true });
  });

  // ── Forgot password (request reset) ──────────────────────────
  const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many reset attempts. Please try again later.' },
  });

  router.post('/auth/forgot-password', passwordResetLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Always return success to prevent email enumeration. Supabase Auth sends the
    // recovery email with a link to the configured redirect URL.
    const redirectTo = `${req.protocol}://${req.get('host')}/reset-password`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    res.json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
  });

  // ── Reset password (Supabase recovery token) ─────────────────
  router.post('/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password required' });
    }
    // Password strength validation
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one special character' });
    }

    try {
      // The token is the Supabase recovery access token embedded in the emailed
      // link. Resolve the identity, then set the new password via the admin API.
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      const authUserId = data.user.id;
      await supabaseUpdateUser(authUserId, { password: newPassword });

      const appUser = await findUserByEmail(data.user.email || '');
      if (appUser) {
        await upsertUser({ id: appUser.id, passwordHash: hashPassword(newPassword), mustChangePassword: false });
      }

      await audit({ event: 'USER_PASSWORD_RESET', actor: data.user.email || 'unknown', role: 'SYSTEM', action: AuditAction.USER_PASSWORD_RESET, details: `Password reset completed for user ${data.user.email}` });

      res.json({ ok: true, message: 'Password reset successful' });
    } catch {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
  });

  return router;
}