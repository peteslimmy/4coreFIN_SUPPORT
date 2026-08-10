import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { requireAdmin } from '../middleware/requireAdmin';
import { listJsonTable, replaceJsonTable, getConfig, setConfig, appendAuditLog } from '../repository';
import { DEFAULT_ROLES, getRoles } from '../rbac';
import { getDefaultBuFormConfigs, mergeConfigs } from '../../src/lib/formConfigs';
import { businessUnitNames } from '../../src/lib/buCodes';

const CONFIG_TABLES = ['sla_rules', 'holidays', 'ticket_templates', 'kb_articles'];
const CONFIG_KEYS = ['businessUnits', 'businessUnitCodes', 'paymentChannels', 'partners', 'categories', 'notificationConfigs', 'savedReplies', 'buFormConfigs', 'roles', 'escalationRules'];

export function createConfigRouter(): Router {
  const router = Router();

  // ── Config dispatcher (array tables + scalar keys share one route) ──
  router.get('/config/:name', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    const { name } = req.params;
    if (CONFIG_TABLES.includes(name)) {
      const rows = await listJsonTable(name);
      return res.json(rows);
    }
    if (CONFIG_KEYS.includes(name)) {
      const value = await getConfig(name, null);
      return res.json(value);
    }
    return res.status(404).json({ error: 'Unknown config name' });
  });

  router.put('/config/:name', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    const { name } = req.params;
    if (CONFIG_TABLES.includes(name)) {
      await replaceJsonTable(name, req.body);
      await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'CONFIG_TABLE_UPDATED', details: `Updated config table ${name}` });
      return res.json(req.body);
    }
    if (CONFIG_KEYS.includes(name)) {
      await setConfig(name, req.body);
      await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'CONFIG_UPDATED', details: `Updated config key ${name}` });
      return res.json(req.body);
    }
    return res.status(404).json({ error: 'Unknown config name' });
  });

  router.post('/config/buFormConfigs/import', requireAuth, requireAdmin, validateBody(z.object({
    targetBu: z.string().min(1),
    fields: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(['text','number','currency','select','date','textarea']),
      options: z.array(z.string()).optional(),
      placeholder: z.string().optional(),
      required: z.boolean().optional().default(false),
      enabled: z.boolean().optional().default(true),
      duplicateKey: z.boolean().optional().default(false),
      order: z.coerce.number().int().optional(),
      helpText: z.string().optional(),
      validation: z.object({
        min: z.coerce.number().optional(),
        max: z.coerce.number().optional(),
        pattern: z.string().optional(),
        message: z.string().optional()
      }).optional(),
      showIf: z.object({
        field: z.string().optional(),
        equals: z.union([z.string(), z.number(), z.boolean()]).optional()
      }).optional(),
    })),
    version: z.coerce.number().int().optional(),
  })), async (req: AuthedRequest, res: Response) => {
    try {
      const { targetBu, fields, version } = req.body as { targetBu: string; fields: any[]; version?: number };
      const allConfigs: any[] = await getConfig('buFormConfigs', []);
      const existing = allConfigs.find((c: any) => c.bu === targetBu)
        ?? getDefaultBuFormConfigs().find((c: any) => c.bu === targetBu)
        ?? { bu: targetBu, fields: [], version: 1, updatedAt: new Date().toISOString(), updatedBy: 'SYSTEM' };
      const mapped = fields.map((f: any) => ({
        id: String(f.id ?? '').trim(),
        label: String(f.label ?? '').trim(),
        type: f.type,
        options: Array.isArray(f.options) ? f.options : undefined,
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
        required: !!f.required,
        enabled: f.enabled === undefined ? true : !!f.enabled,
        duplicateKey: !!f.duplicateKey,
        order: typeof f.order === 'number' && !Number.isNaN(f.order) ? f.order : 0,
        helpText: f.helpText ? String(f.helpText) : undefined,
        validation: f.validation && typeof f.validation === 'object' ? { ...f.validation } : undefined,
        showIf: f.showIf && typeof f.showIf === 'object' ? { ...f.showIf } : undefined,
      }));
      const { config: merged, summary } = mergeConfigs(existing, mapped);
      merged.updatedBy = req.user!.name;
      merged.version = (typeof version === 'number' && !Number.isNaN(version)) ? version + 1 : existing.version + 1;
      const next = allConfigs.some((c: any) => c.bu === targetBu)
        ? allConfigs.map((c: any) => c.bu === targetBu ? merged : c)
        : [...allConfigs, merged];
      await setConfig('buFormConfigs', next);
      await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'FORM_CONFIG_IMPORTED', details: 'Imported ' + merged.fields.length + ' fields for BU ' + targetBu + ' (' + fields.length + ' rows, +' + summary.added + ' new, ~' + summary.updated + ' updated).' });
      res.json({ success: true, config: merged, summary });
    } catch (e: any) {
      res.status(400).json({ error: (e.errors as any)?.map((x: any) => ((x.path || []).join('.') + ': ' + x.message)).join('; ') || e.message || 'Import failed' });
    }
  });

  // ── Roles & Settings ──
  router.get('/roles', requireAuth, requirePermission('admin:access'), async (_req: AuthedRequest, res: Response) => {
    const roles = await getConfig('roles', null);
    res.json(roles ?? DEFAULT_ROLES);
  });

  router.put('/roles', requireAuth, requireRoles('SUPER_ADMIN'), async (req: AuthedRequest, res: Response) => {
    await setConfig('roles', req.body);
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'ROLES_UPDATED', details: 'Roles config updated' });
    res.json(req.body);
  });

  router.get('/settings', requireAuth, requirePermission('admin:config'), async (_req: AuthedRequest, res: Response) => {
    const settings = await getConfig('settings', null);
    res.json(settings ?? {});
  });

  router.put('/settings', requireAuth, requireRoles('SUPER_ADMIN'), async (req: AuthedRequest, res: Response) => {
    await setConfig('settings', req.body);
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'SETTINGS_UPDATED', details: 'Settings updated' });
    res.json(req.body);
  });

  // ── Form configs ──
  router.get('/form-configs', requireAuth, async (req: AuthedRequest, res: Response) => {
    const configs: any[] = await getConfig('buFormConfigs', getDefaultBuFormConfigs());
    const bu = req.query.bu as string | undefined;
    if (bu) {
      const single = configs.find((c: any) => c.bu === bu) ?? getDefaultBuFormConfigs().find((c: any) => c.bu === bu);
      return res.json(single ?? getDefaultBuFormConfigs().find((c: any) => c.bu === bu));
    }
    res.json(configs.length ? configs : getDefaultBuFormConfigs());
  });

  router.put('/form-configs/:bu', requireAuth, requirePermission('admin:forms'), async (req: AuthedRequest, res: Response) => {
    const bu = (req.params.bu || '').toUpperCase();
    const existing: any[] = await getConfig('buFormConfigs', []);
    const updated = { ...(existing.find((c: any) => c.bu === bu) ?? getDefaultBuFormConfigs().find((c: any) => c.bu === bu) ?? { bu, fields: [], version: 1 }), ...req.body, bu, updatedAt: new Date().toISOString(), updatedBy: req.user!.name };
    const next = existing.some((c: any) => c.bu === bu) ? existing.map((c: any) => c.bu === bu ? updated : c) : [...existing, updated];
    await setConfig('buFormConfigs', next);
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'FORM_CONFIG_UPDATED', details: `Updated form config for BU ${bu}` });
    res.json(updated);
  });

  // ── Saved Replies ──
  router.get('/saved-replies', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const saved: any[] = await getConfig('savedReplies', []);
    res.json(saved);
  });

  router.put('/saved-replies', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    await setConfig('savedReplies', req.body);
    res.json(req.body);
  });

  // ── RBAC / Roles management ──
  router.get('/rbac/roles', requireAuth, requirePermission('admin:access'), async (_req: AuthedRequest, res: Response) => {
    const stored = await getConfig('roles', null);
    res.json(getRoles(stored));
  });

  // ── Notification settings ──
  router.get('/notification-configs', requireAuth, requirePermission('admin:config'), async (_req: AuthedRequest, res: Response) => {
    const configs: any[] = await getConfig('notificationConfigs', []);
    res.json(configs);
  });

  router.put('/notification-configs', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    await setConfig('notificationConfigs', req.body);
    res.json(req.body);
  });

  // ── Business Units / Providers / Categories ──
  router.get('/business-units', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const bus: any[] = await getConfig('businessUnits', []);
    res.json(bus);
  });

  router.put('/business-units', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    await setConfig('businessUnits', req.body);
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'CONFIG_UPDATED', details: `Updated business units` });
    res.json(req.body);
  });

  router.get('/partners', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const partners: any[] = await getConfig('partners', []);
    res.json(partners);
  });

  router.put('/partners', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    await setConfig('partners', req.body);
    res.json(req.body);
  });

  router.get('/categories', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const categories: any[] = await getConfig('categories', []);
    res.json(categories);
  });

  router.put('/categories', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    await setConfig('categories', req.body);
    res.json(req.body);
  });

  return router;
}
