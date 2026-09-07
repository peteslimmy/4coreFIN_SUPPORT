import { z } from 'zod';
import {
  upsertMajorIncident,
  getScopedMajorIncident,
} from '../repository';
import { audit, AuditAction } from '../auditEvents';
import { normalizeStatus, severityJustificationRequired } from '../lib/majorIncidentStateMachine';
import type { AuthedRequest } from '../auth';
import type { Response } from 'express';
import {
  buildMajorIncidentObject,
  linkTicketsToMajorIncident,
  applyMajorIncidentTransition,
  buildAndDispatchIncidentNotification,
  retryIncidentNotification,
} from '../services/majorIncidentService';

export const declareMajorIncidentSchema = z.object({
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
});

export async function handleDeclareMajorIncident(
  req: AuthedRequest,
  res: Response,
) {
  const b = req.body;
  if (severityJustificationRequired(b.severity) && !String(b.severityJustification || '').trim()) {
    return res.status(400).json({ error: 'A justification is required when declaring a SEV-1 (CRITICAL) major incident.' });
  }

  const now = new Date().toISOString();
  const primaryPartner = b.partner || b.affectedPartners?.[0] || '';

  // Build and dispatch notification
  const notification = await buildAndDispatchIncidentNotification({
    incidentName: b.name,
    severity: b.severity,
    affectedPartners: b.affectedPartners,
    affectedBus: b.affectedBus,
    impactDescription: b.impact?.description || '',
    description: b.description,
    expectedRto: b.expectedRto || '',
    primaryPartner,
    initialNotification: b.initialNotification,
    recipient: b.recipient,
    now,
  });

  const notifications = [notification];

  const mi = buildMajorIncidentObject({
    body: b,
    user: req.user!,
    now,
    notifications,
  });

  await linkTicketsToMajorIncident(b.links, String(mi.id), b.severity === 'CRITICAL');

  await upsertMajorIncident(mi);
  await audit({
    event: 'MAJOR_INCIDENT_DECLARED',
    actor: req.user!.name,
    role: req.user!.role,
    action: AuditAction.MAJOR_INCIDENT_DECLARED,
    details: `${mi.name} (${b.severity}) declared${b.links.length ? `, linking ${b.links.length} ticket(s)` : ''}.`,
  });
  res.status(201).json(mi);
}

export async function handleUpdateMajorIncident(
  req: AuthedRequest,
  res: Response,
) {
  const existing = await getScopedMajorIncident(req.params.id, req.user!);
  if (!existing) return res.status(404).json({ error: 'Major incident not found' });

  const fromStatus = normalizeStatus(existing.status);
  const requestedStatus = req.body?.status ? normalizeStatus(req.body.status) : fromStatus;
  const patch = { ...req.body, tenantId: existing.tenantId };

  const result = applyMajorIncidentTransition({
    existing,
    requestedStatus,
    patch,
    user: req.user!,
    now: new Date().toISOString(),
  });

  if (!result.allowed) {
    return res.status(409).json({ error: result.error });
  }

  const nextMerged = result.merged!;
  if (result.timelineEntry) {
    nextMerged.timeline = [
      ...(existing.timeline || []),
      result.timelineEntry,
    ];
  }

  await upsertMajorIncident(nextMerged);
  if (requestedStatus !== fromStatus) {
    await audit({
      ticketId: null,
      actor: req.user!.name,
      role: req.user!.role,
      action: AuditAction.MAJOR_INCIDENT_STATUS,
      details: `${existing.name}: ${fromStatus} → ${requestedStatus}.`,
    });
  }
  res.json(nextMerged);
}

export async function handleRetryMajorIncidentNotification(
  req: AuthedRequest,
  res: Response,
) {
  const existing = await getScopedMajorIncident(req.params.id, req.user!);
  if (!existing) return res.status(404).json({ error: 'Major incident not found' });
  
  const retryResult = await retryIncidentNotification({
    existingIncident: existing,
    notificationId: req.params.notifId,
  });

  if (!retryResult.success) {
    return res.status(404).json({ error: retryResult.error });
  }

  const patched = { ...existing, notifications: retryResult.notifications, tenantId: existing.tenantId };
  await upsertMajorIncident(patched);
  res.json(patched);
}
