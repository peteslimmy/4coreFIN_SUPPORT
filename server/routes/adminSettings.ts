import { Router } from 'express';
import { randomBytes } from 'crypto';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { getSetting, getSettings, getPublicSettings, setSetting, setSettings } from '../services/settingsService';
import { uploadFile } from '../services/storageService';
import { encrypt, decrypt, maskValue } from '../services/encryptionService';
import { sendEmail } from '../services/emailService';
import { appendAuditLog } from '../repository';
import { supabase } from '../supabase';

export function createAdminSettingsRouter(): Router {
  const router = Router();

  // ── Public settings (no auth — for login page branding) ──────
  router.get('/public/settings', async (_req, res) => {
    const settings = await getPublicSettings();
    res.json(settings);
  });

  // ── Admin: Get all settings ──────────────────────────────────
  router.get('/admin/settings', requireAuth, requirePermission('admin:config'), async (_req: AuthedRequest, res) => {
    const settings = await getSettings();
    // Mask sensitive fields
    if (settings['smtp.password']) {
      settings['smtp.password'] = maskValue(decrypt(settings['smtp.password']));
    }
    res.json(settings);
  });

  // ── Admin: Get single setting ────────────────────────────────
  router.get('/admin/settings/:key', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const value = await getSetting(req.params.key);
    if (value === null) return res.status(404).json({ error: 'Setting not found' });
    res.json({ key: req.params.key, value });
  });

  // ── Admin: Update single setting ─────────────────────────────
  router.put('/admin/settings/:key', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const { key } = req.params;
    let value = req.body.value;

    // Encrypt sensitive fields
    if (key === 'smtp.password' && value && !value.includes('••••')) {
      value = encrypt(value);
    }

    await setSetting(key, value, req.user!.id);
    await appendAuditLog({
      ticketId: null,
      actor: req.user!.name,
      role: req.user!.role,
      action: 'ADMIN_SETTING_UPDATED',
      details: `Updated setting: ${key}`,
    });
    res.json({ ok: true, key, value: key === 'smtp.password' ? '••••••••' : value });
  });

  // ── Admin: Bulk update settings ──────────────────────────────
  router.put('/admin/settings', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Expected settings object' });
    }

    // Encrypt sensitive fields
    if (settings['smtp.password'] && !settings['smtp.password'].includes('••••')) {
      settings['smtp.password'] = encrypt(settings['smtp.password']);
    }

    await setSettings(settings, req.user!.id);
    await appendAuditLog({
      ticketId: null,
      actor: req.user!.name,
      role: req.user!.role,
      action: 'ADMIN_SETTINGS_BULK_UPDATED',
      details: `Updated ${Object.keys(settings).length} settings`,
    });
    res.json({ ok: true });
  });

  // ── Admin: Upload branding asset ─────────────────────────────
  router.post('/admin/branding/upload', requireAuth, requirePermission('admin:branding'), async (req: AuthedRequest, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = String(req.headers['content-type'] || 'image/png');
        const filename = String(req.headers['x-filename'] || 'upload.png');
        const folder = String(req.headers['x-folder'] || 'branding');

        const url = await uploadFile(buffer, filename, contentType, folder);
        if (!url) return res.status(500).json({ error: 'Upload failed' });

        await appendAuditLog({
          ticketId: null,
          actor: req.user!.name,
          role: req.user!.role,
          action: 'ADMIN_BRANDING_UPLOAD',
          details: `Uploaded branding asset: ${filename}`,
        });
        res.json({ url });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  // ── Admin: SMTP test ─────────────────────────────────────────
  router.post('/admin/smtp/test', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    try {
      const settings = await getSettings([
        'smtp.host', 'smtp.port', 'smtp.security', 'smtp.username',
        'smtp.password', 'smtp.from_email', 'smtp.from_name'
      ]);

      if (!settings['smtp.host'] || !settings['smtp.port']) {
        return res.status(400).json({ error: 'SMTP host and port are required' });
      }

      const result = await sendEmail({
        to: req.user!.email,
        subject: '4CoreFin SMTP Test',
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px"><h2 style="color:#1e293b;margin:0 0 8px">SMTP test successful</h2><p style="color:#475569;line-height:1.6">This message confirms that your SMTP configuration for <strong>${settings['smtp.host']}:${settings['smtp.port']}</strong> is working correctly.</p></div>`,
        text: 'SMTP test successful. Your 4CoreFin SMTP configuration is working correctly.',
      });

      if (!result.ok) {
        return res.status(500).json({ error: `SMTP test failed: ${result.error}` });
      }

      await appendAuditLog({
        ticketId: null,
        actor: req.user!.name,
        role: req.user!.role,
        action: 'ADMIN_SMTP_TEST',
        details: `SMTP test email sent to ${req.user!.email} via ${settings['smtp.host']}:${settings['smtp.port']}`,
      });
      res.json({ ok: true, message: 'SMTP test email sent successfully' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: API Keys ──────────────────────────────────────────
  router.get('/admin/api-keys', requireAuth, requirePermission('admin:config'), async (_req: AuthedRequest, res) => {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, service, is_active, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  router.post('/admin/api-keys', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const { name, service, key } = req.body;
    if (!name || !service || !key) {
      return res.status(400).json({ error: 'name, service, and key are required' });
    }
    const id = 'ak-' + Date.now();
    const encryptedKey = encrypt(key);
    const { error } = await supabase.from('api_keys').insert({
      id, name, service, encrypted_key: encryptedKey,
      created_by: req.user!.id,
    });
    if (error) return res.status(500).json({ error: error.message });
    await appendAuditLog({
      ticketId: null, actor: req.user!.name, role: req.user!.role,
      action: 'ADMIN_API_KEY_CREATED', details: `Created API key: ${name} (${service})`,
    });
    res.status(201).json({ id, name, service, is_active: true });
  });

  router.delete('/admin/api-keys/:id', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const { error } = await supabase.from('api_keys').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await appendAuditLog({
      ticketId: null, actor: req.user!.name, role: req.user!.role,
      action: 'ADMIN_API_KEY_DELETED', details: `Deleted API key: ${req.params.id}`,
    });
    res.json({ ok: true });
  });

  router.post('/admin/api-keys/:id/reveal', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const { data, error } = await supabase.from('api_keys').select('encrypted_key').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    const revealed = decrypt(data.encrypted_key);
    await appendAuditLog({
      ticketId: null, actor: req.user!.name, role: req.user!.role,
      action: 'ADMIN_API_KEY_REVEALED', details: `Revealed API key: ${req.params.id}`,
    });
    res.json({ key: revealed });
  });

  // ── Admin: Webhooks ──────────────────────────────────────────
  router.get('/admin/webhooks', requireAuth, requirePermission('admin:config'), async (_req: AuthedRequest, res) => {
    const { data, error } = await supabase
      .from('webhooks')
      .select('id, name, url, events, is_active, last_fired_at, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  router.post('/admin/webhooks', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const { name, url, events } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }
    const id = 'wh-' + Date.now();
    const secret = randomBytes(32).toString('hex');
    const { error } = await supabase.from('webhooks').insert({
      id, name, url, events: events || [], secret,
      created_by: req.user!.id,
    });
    if (error) return res.status(500).json({ error: error.message });
    await appendAuditLog({
      ticketId: null, actor: req.user!.name, role: req.user!.role,
      action: 'ADMIN_WEBHOOK_CREATED', details: `Created webhook: ${name}`,
    });
    res.status(201).json({ id, name, url, events, is_active: true, secret });
  });

  router.delete('/admin/webhooks/:id', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res) => {
    const { error } = await supabase.from('webhooks').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await appendAuditLog({
      ticketId: null, actor: req.user!.name, role: req.user!.role,
      action: 'ADMIN_WEBHOOK_DELETED', details: `Deleted webhook: ${req.params.id}`,
    });
    res.json({ ok: true });
  });

  return router;
}
