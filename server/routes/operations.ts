import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { runSlaCheck } from '../slaJob';
import { addSseClient, removeSseClient } from '../broadcast';
import { listNotifications, insertNotification, markNotificationRead, listMajorIncidents, getScopedMajorIncident, getScopedTicket, getConfig, ticketFacetCounts } from '../repository';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../rbac';
import { validateSvgBuffer } from '../lib/svgSanitize';
import { getCachedRoles } from '../middleware/requirePermission';
import { buildId } from '../lib/ids';
import { uploadFile } from '../services/storageService';
import {
  declareMajorIncidentSchema,
  handleDeclareMajorIncident,
  handleUpdateMajorIncident,
  handleRetryMajorIncidentNotification,
} from './majorIncidentHandlers';
import { buildBootstrapJobs, executeBootstrapJobs, resolveBootstrapRoles } from '../services/bootstrapService';

export function createOperationsRouter(): Router {
  const router = Router();

  // ── Bootstrap ──
  router.get('/bootstrap', requireAuth, async (req: AuthedRequest, res: Response) => {
    const roles = getCachedRoles(res) ?? getRoles(await getConfig<RoleDefinition[]>('roles', []));
    const can = (permission: Permission) => hasPermissionForRoleId(roles, req.user!.role, permission);

    const scope = (req.query.scope as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || null;

    const jobs = buildBootstrapJobs({
      user: req.user!,
      scope,
      roles,
      can,
    });

    const data = await executeBootstrapJobs(jobs);

    const rolesData = resolveBootstrapRoles({
      cachedRoles: getCachedRoles(res),
      roleConfig: await getConfig<RoleDefinition[]>('roles', []),
      wantsRoles: !scope || scope.includes('roles'),
    });
    if (rolesData) data.roles = rolesData;

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

  router.post('/notifications', requireAuth, requirePermission('notifications:view'),
    validateBody(z.object({
      ticketId: z.string().min(1),
      message: z.string().min(1),
      recipient: z.string().optional(),
    })),
    async (req: AuthedRequest, res: Response) => {
    const n = req.body;
    const ticket = await getScopedTicket(n.ticketId, req.user!);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const entry = { ...n, id: n.id || buildId('wn'), timestamp: new Date().toISOString(), recipient: n.recipient || req.user!.email, seen: false };
    await insertNotification(entry);
    res.status(201).json(entry);
  });

  router.patch('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res: Response) => {
    await markNotificationRead(req.params.id, req.user!);
    res.json({ ok: true });
  });

  // ── Major Incidents ──
  router.get('/major-incidents', requireAuth, requirePermission('major-incidents:manage'), async (req: AuthedRequest, res: Response) => {
    const rows = await listMajorIncidents(req.user!);
    res.json(rows);
  });

  router.get('/major-incidents/:id', requireAuth, requirePermission('major-incidents:manage'), async (req: AuthedRequest, res: Response) => {
    const row = await getScopedMajorIncident(req.params.id, req.user!);
    if (!row) return res.status(404).json({ error: 'Major incident not found' });
    res.json(row);
  });

  router.post('/major-incidents', requireAuth, requirePermission('major-incidents:declare'), validateBody(declareMajorIncidentSchema), async (req: AuthedRequest, res: Response) => {
    await handleDeclareMajorIncident(req, res);
  });

  router.patch('/major-incidents/:id', requireAuth, requirePermission('major-incidents:manage'),
    validateBody(z.record(z.string(), z.unknown())),
    async (req: AuthedRequest, res: Response) => {
    await handleUpdateMajorIncident(req, res);
  });

  router.post('/major-incidents/:id/notifications/:notifId/retry', requireAuth, requirePermission('major-incidents:manage'), async (req: AuthedRequest, res: Response) => {
    await handleRetryMajorIncidentNotification(req, res);
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
        if (contentType === 'image/svg+xml') {
          const svgError = validateSvgBuffer(fileBuffer);
          if (svgError) return res.status(415).json({ error: svgError });
        }
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
    // Light 3-column projection instead of hydrating every ticket row.
    const { byBu, byStatus, byPriority } = await ticketFacetCounts();
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    res.json({
      total,
      byBu,
      byStatus,
      byPriority,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
