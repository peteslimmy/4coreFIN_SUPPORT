import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { runSlaCheck } from '../slaJob';
import { addSseClient, removeSseClient } from '../broadcast';
import { listNotifications, insertNotification, markNotificationRead, listMajorIncidents, upsertMajorIncident, getScopedMajorIncident, getScopedTicket, listTickets, listComments, listEvidence, listAuditLogs, listUsersPublic, listCustomers, listJsonTable, getConfig } from '../repository';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../rbac';
import { uploadFile } from '../services/storageService';

export function createOperationsRouter(): Router {
  const router = Router();

  // ── Bootstrap ──
  router.get('/bootstrap', requireAuth, async (req: AuthedRequest, res: Response) => {
    const roles = getRoles(await getConfig<RoleDefinition[]>('roles', []));
    const can = (permission: Permission) => hasPermissionForRoleId(roles, req.user!.role, permission);

    // Optional ?scope=tickets,comments,evidence,... lets clients fetch only the
    // domains they need. Omitting scope returns everything the role can see.
    const scope = (req.query.scope as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || null;
    const wants = (name: string) => !scope || scope.includes(name);

    const data: Record<string, unknown> = {};
    if (wants('tickets')) data.tickets = await listTickets(req.user!, { includeDeleted: false });
    if (wants('comments')) data.comments = await listComments(undefined, req.user!);
    if (wants('watcherNotifications')) data.watcherNotifications = await listNotifications(req.user!.email, req.user!);
    if (wants('majorIncidents')) data.majorIncidents = await listMajorIncidents(req.user!);
    if (wants('evidence')) data.evidence = await listEvidence(undefined, req.user!);

    if (wants('auditLogs') && can('audit:view')) data.auditLogs = await listAuditLogs(500, req.user!);
    if (wants('users') && can('admin:users')) data.users = await listUsersPublic();
    if (wants('customers') && can('customers:manage')) data.customers = await listCustomers(req.user!);
    if (wants('config') && can('admin:config')) {
      data.slaRules = await listJsonTable('sla_rules');
      data.holidays = await listJsonTable('holidays');
      data.ticketTemplates = await listJsonTable('ticket_templates');
      data.kbArticles = await listJsonTable('kb_articles');
      data.savedReplies = await getConfig('savedReplies', []);
      data.businessUnits = await getConfig('businessUnits', []);
      data.providers = await getConfig('providers', []);
      data.categories = await getConfig('categories', []);
      data.buFormConfigs = await getConfig('buFormConfigs', []);
      data.notificationConfigs = await getConfig('notificationConfigs', []);
      data.escalationRules = await getConfig('escalationRules', []);
    }
    if (wants('roles')) data.roles = getRoles(await getConfig<RoleDefinition[]>('roles', []));

    res.json(data);
  });

  // ── SLA job manual trigger ──
  router.post('/sla/run-check', requireAuth, requirePermission('admin:sla'), async (_req: AuthedRequest, res: Response) => {
    res.json(await runSlaCheck());
  });

  // ── SSE ──
  router.get('/events', requireAuth, (req: AuthedRequest, res: Response) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: connected\ndata: ${JSON.stringify({ user: req.user!.email })}\n\n`);
    const global = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'EXECUTIVE' || req.user!.bu === 'ALL';
    addSseClient(res, req.user!.id, req.user!.role, req.user!.bu, req.user!.tenantId || null, global);
    // Heartbeat keeps idle connections alive through proxies and detects dead peers.
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
        if (res.writableEnded) {
          clearInterval(heartbeat);
          removeSseClient(res);
        }
      } catch {
        clearInterval(heartbeat);
        removeSseClient(res);
      }
    }, 25_000);
    heartbeat.unref?.();
    req.on('close', () => {
      clearInterval(heartbeat);
      removeSseClient(res);
    });
  });

  // ── Notifications ──
  router.get('/notifications', requireAuth, async (req: AuthedRequest, res: Response) => {
    const all = await listNotifications(req.user!.email, req.user!);
    res.json(all);
  });

  router.post('/notifications', requireAuth, async (req: AuthedRequest, res: Response) => {
    const n = req.body;
    const ticket = await getScopedTicket(n.ticketId, req.user!);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const entry = { ...n, id: n.id || 'wn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), timestamp: new Date().toISOString(), recipient: n.recipient || req.user!.email, seen: false };
    await insertNotification(entry);
    res.status(201).json(entry);
  });

  router.patch('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res: Response) => {
    await markNotificationRead(req.params.id);
    res.json({ ok: true });
  });

  // ── Major Incidents ──
  router.get('/major-incidents', requireAuth, async (req: AuthedRequest, res: Response) => {
    const rows = await listMajorIncidents(req.user!);
    res.json(rows);
  });

  router.get('/major-incidents/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    const row = await getScopedMajorIncident(req.params.id, req.user!);
    if (!row) return res.status(404).json({ error: 'Major incident not found' });
    res.json(row);
  });

  router.post('/major-incidents', requireAuth, requirePermission('major-incidents:manage'), validateBody(z.object({ id: z.string().optional(), name: z.string().optional(), description: z.string().optional(), provider: z.string().optional(), category: z.string().optional(), severity: z.string().optional(), active: z.boolean().optional(), ticketCount: z.number().optional(), createdAt: z.string().optional(), status: z.string().optional(), timeline: z.array(z.unknown()).optional(), notifications: z.array(z.unknown()).optional(), pir: z.record(z.string(), z.unknown()).optional() })), async (req: AuthedRequest, res: Response) => {
    const mi = req.body;
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'EXECUTIVE' && req.user!.bu !== 'ALL') {
      mi.tenantId = req.user!.tenantId || 'tnt-global';
    }
    await upsertMajorIncident(mi);
    res.status(201).json(mi);
  });

  router.patch('/major-incidents/:id', requireAuth, requirePermission('major-incidents:manage'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedMajorIncident(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Major incident not found' });
    const patched = { ...existing, ...req.body, tenantId: existing.tenantId };
    await upsertMajorIncident(patched);
    res.json(patched);
  });

  // ── Storage (branding assets) ──
  router.post('/storage/upload', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthedRequest, res: Response) => {
    const STORAGE_MAX_BYTES = 10 * 1024 * 1024;
    const STORAGE_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']);
    const contentType = (req.headers['content-type'] as string) || 'image/png';
    if (!STORAGE_ALLOWED_TYPES.has(contentType)) {
      return res.status(415).json({ error: `Unsupported file type: ${contentType}` });
    }

    const chunks: Buffer[] = [];
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > STORAGE_MAX_BYTES) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      try {
        const fileBuffer = Buffer.concat(chunks);
        if (fileBuffer.length === 0) return res.status(400).json({ error: 'Empty file' });
        if (fileBuffer.length > STORAGE_MAX_BYTES) return res.status(413).json({ error: 'File exceeds 10MB limit' });
        const fileName = (req.headers['x-file-name'] as string) || 'upload.png';
        const url = await uploadFile(fileBuffer, fileName, contentType);
        if (!url) return res.status(500).json({ error: 'Upload failed' });
        res.json({ url });
      } catch (e: any) {
        res.status(500).json({ error: e.message || 'Upload failed' });
      }
    });
  });

  // ── Reports / executives ──
  router.get('/executive/metrics', requireAuth, requirePermission('executive:dashboard'), async (req: AuthedRequest, res: Response) => {
    const tickets = await listTickets(req.user!, { includeDeleted: false, unmask: req.user!.role === 'SUPER_ADMIN' });
    const ticketsByBu: Record<string, number> = {};
    const ticketsByStatus: Record<string, number> = {};
    const ticketsByPriority: Record<string, number> = {};
    for (const t of tickets) {
      ticketsByBu[t.businessUnit || 'UNKNOWN'] = (ticketsByBu[t.businessUnit || 'UNKNOWN'] || 0) + 1;
      ticketsByStatus[t.status || 'UNKNOWN'] = (ticketsByStatus[t.status || 'UNKNOWN'] || 0) + 1;
      ticketsByPriority[t.priority || 'UNKNOWN'] = (ticketsByPriority[t.priority || 'UNKNOWN'] || 0) + 1;
    }
    res.json({
      total: tickets.length,
      byBu: ticketsByBu,
      byStatus: ticketsByStatus,
      byPriority: ticketsByPriority,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
