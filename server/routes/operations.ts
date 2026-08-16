import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { runSlaCheck } from '../slaJob';
import { addSseClient, removeSseClient } from '../broadcast';
import { listNotifications, insertNotification, markNotificationRead, listMajorIncidents, upsertMajorIncident, getScopedMajorIncident, getScopedTicket, listTickets, listComments, listEvidence, listAuditLogs, listUsersPublic, listCustomers, listJsonTable, getConfig, linkTicketToMajorIncident } from '../repository';
import { audit, AuditAction } from '../auditEvents';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../rbac';
import { getCachedRoles } from '../middleware/requirePermission';
import { buildId, buildToken } from '../lib/ids';
import { uploadFile } from '../services/storageService';
import { normalizeBusinessUnits } from '../../src/lib/buCodes';
import { dispatchNotification } from '../services/dispatchService';
import { nextStatuses, resolveRequires, closeRequires, normalizeStatus, severityJustificationRequired, isActiveStatus } from '../lib/majorIncidentStateMachine';

export function createOperationsRouter(): Router {
  const router = Router();

  // ── Bootstrap ──
  router.get('/bootstrap', requireAuth, async (req: AuthedRequest, res: Response) => {
    const roles = getCachedRoles(res) ?? getRoles(await getConfig<RoleDefinition[]>('roles', []));
    const can = (permission: Permission) => hasPermissionForRoleId(roles, req.user!.role, permission);

    // Optional ?scope=tickets,comments,evidence,... lets clients fetch only the
    // domains they need. Omitting scope returns everything the role can see.
    const scope = (req.query.scope as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || null;
    const wants = (name: string) => !scope || scope.includes(name);

    // Independent domains are fetched concurrently — login latency becomes
    // the slowest single query instead of the serial sum of every domain.
    const jobs: Array<Promise<[string, unknown] | null>> = [];
    const add = (key: string, fn: () => Promise<unknown>) => jobs.push(fn().then((v) => [key, v] as [string, unknown]));

    if (wants('tickets')) add('tickets', () => listTickets(req.user!, { includeDeleted: false }));
    if (wants('comments')) add('comments', () => listComments(undefined, req.user!));
    if (wants('watcherNotifications')) add('watcherNotifications', () => listNotifications(req.user!.email, req.user!));
    if (wants('majorIncidents')) add('majorIncidents', () => listMajorIncidents(req.user!));
    if (wants('evidence')) add('evidence', () => listEvidence(undefined, req.user!));
    if (wants('auditLogs') && can('audit:view')) add('auditLogs', () => listAuditLogs(500, req.user!));
    if (wants('users') && can('users:view')) add('users', () => listUsersPublic());
    if (wants('customers') && can('customers:manage')) add('customers', () => listCustomers(req.user!));
    if (wants('config')) {
      add('businessUnits', async () => {
        const buList = normalizeBusinessUnits(await getConfig<any[]>('businessUnits', []));
        return buList.map((b) => b.name);
      });
      add('businessUnitCodes', async () => {
        const buList = normalizeBusinessUnits(await getConfig<any[]>('businessUnits', []));
        return buList.reduce<Record<string, string>>((acc, b) => { acc[b.name] = b.code; return acc; }, {});
      });
      add('paymentChannels', () => getConfig('paymentChannels', []));
    }
    if (wants('config') && can('admin:config')) {
      add('slaRules', () => listJsonTable('sla_rules'));
      add('holidays', () => listJsonTable('holidays'));
      add('ticketTemplates', () => listJsonTable('ticket_templates'));
      add('kbArticles', () => listJsonTable('kb_articles'));
      add('savedReplies', () => getConfig('savedReplies', []));
      add('partners', () => getConfig('partners', []));
      add('categories', () => getConfig('categories', []));
      add('buFormConfigs', () => getConfig('buFormConfigs', []));
      add('notificationConfigs', () => getConfig('notificationConfigs', []));
      add('escalationRules', () => getConfig('escalationRules', []));
    }

    const data: Record<string, unknown> = {};
    const settled = await Promise.all(jobs);
    for (const entry of settled) {
      if (entry) data[entry[0]] = entry[1];
    }

    if (wants('roles')) {
      const cached = getCachedRoles(res);
      data.roles = cached ?? getRoles(await getConfig<RoleDefinition[]>('roles', []));
    }

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
    const entry = { ...n, id: n.id || buildId('wn'), timestamp: new Date().toISOString(), recipient: n.recipient || req.user!.email, seen: false };
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

  router.post('/major-incidents', requireAuth, requirePermission('major-incidents:declare'), validateBody(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    partner: z.string().optional().default(''),
    category: z.string().optional().default(''),
    severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM']),
    affectedPartners: z.array(z.string()).optional().default([]),
    affectedBus: z.array(z.string()).optional().default([]),
    impact: z.object({
      description: z.string().optional().default(''),
      customerCount: z.string().optional().default(''),
      amount: z.string().optional().default(''),
    }).optional(),
    expectedRto: z.string().optional().default(''),
    severityJustification: z.string().optional().default(''),
    initialNotification: z.string().optional().default('Executive Email'),
    recipient: z.string().optional().default('executive-alerts@company.com'),
    links: z.array(z.string()).optional().default([]),
  })), async (req: AuthedRequest, res: Response) => {
    const b = req.body;
    if (severityJustificationRequired(b.severity) && !String(b.severityJustification || '').trim()) {
      return res.status(400).json({ error: 'A justification is required when declaring a SEV-1 (CRITICAL) major incident.' });
    }

    const now = new Date().toISOString();
    const primaryPartner = b.partner || b.affectedPartners?.[0] || '';
    const team = { name: req.user!.name, role: req.user!.role };
    const subject = `CRITICAL OUTAGE WARNING: ${b.name}`;
    const html = [
      `<h2>${b.name}</h2>`,
      `<p><strong>Severity:</strong> ${b.severity}</p>`,
      `<p><strong>Affected partners:</strong> ${b.affectedPartners.length ? b.affectedPartners.join(', ') : (primaryPartner || 'All')}</p>`,
      `<p><strong>Business units:</strong> ${b.affectedBus.length ? b.affectedBus.join(', ') : 'All'}</p>`,
      `<p><strong>Impact:</strong> ${b.impact?.description || b.description}</p>`,
      `<p><strong>Expected RTO:</strong> ${b.expectedRto || 'TBD'}</p>`,
      `<p>${b.description}</p>`,
    ].join('');

    const lowerNotification = (b.initialNotification || 'Executive Email').toLowerCase();
    const dispatchChannel = lowerNotification.includes('slack') || lowerNotification.includes('teams')
      ? b.initialNotification
      : 'Executive Email';
    const notified = await dispatchNotification(
      dispatchChannel === 'Executive Email' ? 'email' : lowerNotification,
      dispatchChannel === 'Executive Email' ? b.recipient : '#ops-severity-1-war-room',
      subject,
      html,
    );
    const notifications = [{
      id: buildToken(12),
      timestamp: now,
      channel: dispatchChannel,
      recipient: dispatchChannel === 'Executive Email' ? b.recipient : '#ops-severity-1-war-room',
      subject,
      status: notified.status,
      ...(notified.error ? { error: notified.error } : {}),
    }];

    const mi: Record<string, unknown> = {
      id: buildId('mi'),
      name: b.name,
      description: b.description,
      partner: primaryPartner,
      category: b.category,
      severity: b.severity,
      active: true,
      ticketCount: b.links.length,
      createdAt: now,
      status: 'DECLARED',
      timeline: [{
        id: buildToken(12),
        timestamp: now,
        author: req.user!.name,
        role: req.user!.role,
        message: `Major incident declared. Severity set to ${b.severity}.`,
      }],
      notifications,
      declaredBy: team,
      owner: null,
      affectedPartners: b.affectedPartners,
      affectedBus: b.affectedBus,
      impact: b.impact || null,
      expectedRto: b.expectedRto || null,
      severityJustification: b.severityJustification || null,
      acknowledgedAt: null,
      resolvedAt: null,
      closedAt: null,
      pir: {
        rootCauseSummary: '',
        timelineSummary: '',
        impactSummary: '',
        preventiveOwner: '',
        preventiveDueDate: '',
        draft: true,
        lastUpdated: now,
        lastUpdatedBy: req.user!.name,
      },
    };
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'EXECUTIVE' && req.user!.bu !== 'ALL') {
      mi.tenantId = req.user!.tenantId || 'tnt-global';
    }

    for (const ticketId of b.links) {
      try {
        await linkTicketToMajorIncident(ticketId, String(mi.id), b.severity === 'CRITICAL');
      } catch (e: any) {
        console.error(`[4C] Failed to link ticket ${ticketId} to incident ${mi.id}: ${e?.message}`);
      }
    }

    await upsertMajorIncident(mi);
    await audit({
      event: 'MAJOR_INCIDENT_DECLARED',
      actor: req.user!.name,
      role: req.user!.role,
      action: AuditAction.MAJOR_INCIDENT_DECLARED,
      details: `${mi.name} (${b.severity}) declared${b.links.length ? `, linking ${b.links.length} ticket(s)` : ''}.`,
    });
    res.status(201).json(mi);
  });

  router.patch('/major-incidents/:id', requireAuth, requirePermission('major-incidents:manage'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedMajorIncident(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Major incident not found' });

    const fromStatus = normalizeStatus(existing.status);
    const requestedStatus = req.body?.status ? normalizeStatus(req.body.status) : fromStatus;
    const isTransition = requestedStatus !== fromStatus;
    const patch = { ...req.body, tenantId: existing.tenantId };
    if (fromStatus === 'DECLARED' && requestedStatus === 'INVESTIGATING') {
      patch.owner = patch.owner ?? { name: req.user!.name, role: req.user!.role };
      patch.acknowledgedAt = patch.acknowledgedAt ?? new Date().toISOString();
    }
    if (requestedStatus === 'RESOLVED') patch.resolvedAt = patch.resolvedAt ?? new Date().toISOString();
    if (requestedStatus === 'CLOSED') patch.closedAt = patch.closedAt ?? new Date().toISOString();
    if (patch.pir && typeof patch.pir === 'object') {
      patch.pir = { ...(existing.pir || {}), ...patch.pir };
      patch.pir.lastUpdated = new Date().toISOString();
      patch.pir.lastUpdatedBy = req.user!.name;
    }

    const nextMerged = {
      ...existing,
      ...patch,
      status: requestedStatus,
      notifications: patch.notifications && Array.isArray(patch.notifications) ? patch.notifications : existing.notifications,
    };
    nextMerged.active = isActiveStatus(nextMerged.status);

    // Enforce the lifecycle: order is validated against the ORIGINAL status,
    // deploy/closure guard conditions against the MERGED state so a client can
    // finalize the PIR and close in a single request.
    if (isTransition) {
      if (!nextStatuses(existing).includes(requestedStatus)) {
        return res.status(409).json({ error: `Cannot move from ${fromStatus} directly to ${requestedStatus}.` });
      }
      // Guard conditions are evaluated against the ORIGINAL status (lifecycle
      // position) merged with the incoming PIR, so finalize-and-close works.
      const guardProbe = { ...nextMerged, status: fromStatus };
      const guard = requestedStatus === 'RESOLVED'
        ? resolveRequires(guardProbe)
        : requestedStatus === 'CLOSED'
          ? closeRequires(guardProbe)
          : null;
      if (guard) return res.status(409).json({ error: guard });
    }

    if (isTransition) {
      const label = {
        INVESTIGATING: 'Incident acknowledged; investigation started.',
        IDENTIFIED: 'Root cause identified.',
        MONITORING: 'Monitoring deployment / regression window.',
        RESOLVED: 'Incident marked resolved.',
        CLOSED: 'Incident closed after PIR finalization.',
      }[requestedStatus] || `Status changed to ${requestedStatus}.`;
      nextMerged.timeline = [
        ...(existing.timeline || []),
        { id: buildToken(12), timestamp: new Date().toISOString(), author: req.user!.name, role: req.user!.role, message: label },
      ];
    }

    await upsertMajorIncident(nextMerged);
    if (isTransition) {
      await audit({
        ticketId: null,
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.MAJOR_INCIDENT_STATUS,
        details: `${existing.name}: ${fromStatus} → ${requestedStatus}.`,
      });
    }
    res.json(nextMerged);
  });

  router.post('/major-incidents/:id/notifications/:notifId/retry', requireAuth, requirePermission('major-incidents:manage'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedMajorIncident(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Major incident not found' });
    const entry = (existing.notifications || []).find((n: any) => n.id === req.params.notifId);
    if (!entry) return res.status(404).json({ error: 'Notification not found' });

    const channel = /slack|teams/i.test(entry.channel) ? entry.channel : 'Executive Email';
    const html = [
      `<h2>${existing.name}</h2>`,
      `<p><strong>Status:</strong> ${existing.status}</p>`,
      `<p><strong>Severity:</strong> ${existing.severity}</p>`,
      `<p>${existing.description || ''}</p>`,
    ].join('');
    const dispatched = await dispatchNotification(
      channel === 'Executive Email' ? 'email' : channel.toLowerCase(),
      entry.recipient,
      entry.subject,
      html,
    );
    const notifications = (existing.notifications || []).map((n: any) =>
      n.id === entry.id
        ? { ...n, status: dispatched.status, ...(dispatched.error ? { error: dispatched.error } : {}), timestamp: new Date().toISOString() }
        : n
    );
    const patched = { ...existing, notifications, tenantId: existing.tenantId };
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
