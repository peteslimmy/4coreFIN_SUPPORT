import { buildId, buildToken } from '../lib/ids';
import {
  nextStatuses,
  resolveRequires,
  closeRequires,
  isActiveStatus,
} from '../lib/majorIncidentStateMachine';
import { linkTicketToMajorIncident } from '../repository';
import { dispatchNotification } from './dispatchService';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

const STATUS_LABELS: Record<string, string> = {
  INVESTIGATING: 'Incident acknowledged; investigation started.',
  IDENTIFIED: 'Root cause identified.',
  MONITORING: 'Monitoring deployment / regression window.',
  RESOLVED: 'Incident marked resolved.',
  CLOSED: 'Incident closed after PIR finalization.',
};

/**
 * Build the HTML email body for a major incident declaration notification.
 */
export function buildMajorIncidentEmailHtml(opts: {
  name: string;
  severity: string;
  affectedPartners: string[];
  affectedBus: string[];
  impactDescription: string;
  description: string;
  expectedRto: string;
  primaryPartner: string;
}): string {
  return [
    `<h2>${escapeHtml(opts.name)}</h2>`,
    `<p><strong>Severity:</strong> ${escapeHtml(opts.severity)}</p>`,
    `<p><strong>Affected partners:</strong> ${opts.affectedPartners.length ? opts.affectedPartners.map(escapeHtml).join(', ') : (opts.primaryPartner ? escapeHtml(opts.primaryPartner) : 'All')}</p>`,
    `<p><strong>Business units:</strong> ${opts.affectedBus.length ? opts.affectedBus.map(escapeHtml).join(', ') : 'All'}</p>`,
    `<p><strong>Impact:</strong> ${escapeHtml(opts.impactDescription || opts.description)}</p>`,
    `<p><strong>Expected RTO:</strong> ${escapeHtml(opts.expectedRto || 'TBD')}</p>`,
    `<p>${escapeHtml(opts.description)}</p>`,
  ].join('');
}

/**
 * Build the HTML email body for a major incident status notification.
 */
export function buildMajorIncidentStatusEmailHtml(opts: {
  name: string;
  status: string;
  severity: string;
  description: string;
}): string {
  return [
    `<h2>${escapeHtml(opts.name)}</h2>`,
    `<p><strong>Status:</strong> ${escapeHtml(opts.status)}</p>`,
    `<p><strong>Severity:</strong> ${escapeHtml(opts.severity)}</p>`,
    `<p>${escapeHtml(opts.description || '')}</p>`,
  ].join('');
}

/**
 * Build the major incident domain object for a new declaration.
 */
export function buildMajorIncidentObject(opts: {
  body: Record<string, unknown>;
  user: { name: string; role: string; bu?: string; tenantId?: string };
  now: string;
  notifications: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  const b = opts.body;
  const primaryPartner = (b.partner as string) || (b.affectedPartners as string[])?.[0] || '';

  const mi: Record<string, unknown> = {
    id: buildId('mi'),
    name: b.name,
    description: b.description,
    partner: primaryPartner,
    category: b.category,
    severity: b.severity,
    active: true,
    ticketCount: (b.links as string[])?.length ?? 0,
    createdAt: opts.now,
    status: 'DECLARED',
    timeline: [{
      id: buildToken(12),
      timestamp: opts.now,
      author: opts.user.name,
      role: opts.user.role,
      message: `Major incident declared. Severity set to ${b.severity}.`,
    }],
    notifications: opts.notifications,
    declaredBy: { name: opts.user.name, role: opts.user.role },
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
      lastUpdated: opts.now,
      lastUpdatedBy: opts.user.name,
    },
  };

  if (opts.user.role !== 'SUPER_ADMIN' && opts.user.role !== 'EXECUTIVE' && opts.user.bu !== 'ALL') {
    mi.tenantId = opts.user.tenantId || 'tnt-global';
  }

  return mi;
}

/**
 * Link tickets to a major incident. Errors are logged but do not throw.
 */
export async function linkTicketsToMajorIncident(
  ticketIds: string[],
  majorIncidentId: string,
  isCritical: boolean,
): Promise<void> {
  for (const ticketId of ticketIds) {
    try {
      await linkTicketToMajorIncident(ticketId, majorIncidentId, isCritical);
    } catch (e: any) {
      console.error(`[4C] Failed to link ticket ${ticketId} to incident ${majorIncidentId}: ${e?.message}`);
    }
  }
}

/**
 * Result of evaluating a major incident status transition.
 */
export interface TransitionResult {
  allowed: boolean;
  error?: string;
  merged?: Record<string, unknown>;
  timelineEntry?: { id: string; timestamp: string; author: string; role: string; message: string };
}

/**
 * Evaluate and apply a major incident status transition. Returns the result
 * without persisting — the caller is responsible for saving.
 */
export function applyMajorIncidentTransition(opts: {
  existing: Record<string, unknown>;
  requestedStatus: string;
  patch: Record<string, unknown>;
  user: { name: string; role: string };
  now: string;
}): TransitionResult {
  const { existing, requestedStatus, patch, user, now } = opts;
  const fromStatus = existing.status as string;
  const isTransition = requestedStatus !== fromStatus;

  if (!isTransition) {
    return { allowed: true, merged: { ...existing, ...patch } };
  }

  // Check transition is allowed
  if (!nextStatuses(existing as any).includes(requestedStatus as any)) {
    return { allowed: false, error: `Cannot move from ${fromStatus} directly to ${requestedStatus}.` };
  }

  // Apply status-specific side effects
  if (fromStatus === 'DECLARED' && requestedStatus === 'INVESTIGATING') {
    patch.owner = patch.owner ?? { name: user.name, role: user.role };
    patch.acknowledgedAt = patch.acknowledgedAt ?? now;
  }
  if (requestedStatus === 'RESOLVED') patch.resolvedAt = patch.resolvedAt ?? now;
  if (requestedStatus === 'CLOSED') patch.closedAt = patch.closedAt ?? now;
  if (patch.pir && typeof patch.pir === 'object') {
    const existingPir = existing.pir && typeof existing.pir === 'object' ? existing.pir : {};
    patch.pir = { ...(existingPir as Record<string, unknown>), ...(patch.pir as Record<string, unknown>) };
    (patch.pir as Record<string, unknown>).lastUpdated = now;
    (patch.pir as Record<string, unknown>).lastUpdatedBy = user.name;
  }

  // Build merged state
  const merged: Record<string, unknown> = {
    ...existing,
    ...patch,
    status: requestedStatus,
    notifications: patch.notifications && Array.isArray(patch.notifications)
      ? patch.notifications
      : existing.notifications,
  };
  merged.active = isActiveStatus(merged.status as string);

  // Guard conditions — evaluated against ORIGINAL status (lifecycle position)
  // merged with incoming PIR, so finalize-and-close works.
  const guardProbe = { ...merged, status: fromStatus };
  const guard = requestedStatus === 'RESOLVED'
    ? resolveRequires(guardProbe)
    : requestedStatus === 'CLOSED'
      ? closeRequires(guardProbe)
      : null;
  if (guard) {
    return { allowed: false, error: guard };
  }

  // Build timeline entry
  const label = STATUS_LABELS[requestedStatus] || `Status changed to ${requestedStatus}.`;
  const timelineEntry = {
    id: buildToken(12),
    timestamp: now,
    author: user.name,
    role: user.role,
    message: label,
  };

  return {
    allowed: true,
    merged,
    timelineEntry,
  };
}

/**
 * Build and dispatch a notification for a major incident.
 * Returns the notification entry to be included in the incident's notifications array.
 */
export async function buildAndDispatchIncidentNotification(opts: {
  incidentName: string;
  severity: string;
  affectedPartners: string[];
  affectedBus: string[];
  impactDescription: string;
  description: string;
  expectedRto: string;
  primaryPartner: string;
  initialNotification: string;
  recipient: string;
  now: string;
}): Promise<Record<string, unknown>> {
  const subject = `CRITICAL OUTAGE WARNING: ${opts.incidentName}`;
  const html = buildMajorIncidentEmailHtml({
    name: opts.incidentName,
    severity: opts.severity,
    affectedPartners: opts.affectedPartners,
    affectedBus: opts.affectedBus,
    impactDescription: opts.impactDescription,
    description: opts.description,
    expectedRto: opts.expectedRto,
    primaryPartner: opts.primaryPartner,
  });

  const lowerNotification = (opts.initialNotification || 'Executive Email').toLowerCase();
  const dispatchChannel = lowerNotification.includes('slack') || lowerNotification.includes('teams')
    ? opts.initialNotification
    : 'Executive Email';
  
  const notified = await dispatchNotification(
    dispatchChannel === 'Executive Email' ? 'email' : lowerNotification,
    dispatchChannel === 'Executive Email' ? opts.recipient : '#ops-severity-1-war-room',
    subject,
    html,
  );

  return {
    id: buildToken(12),
    timestamp: opts.now,
    channel: dispatchChannel,
    recipient: dispatchChannel === 'Executive Email' ? opts.recipient : '#ops-severity-1-war-room',
    subject,
    status: notified.status,
    ...(notified.error ? { error: notified.error } : {}),
  };
}

/**
 * Retry a failed major incident notification.
 * Returns the updated notifications array.
 */
export async function retryIncidentNotification(opts: {
  existingIncident: Record<string, unknown>;
  notificationId: string;
}): Promise<{
  success: boolean;
  notifications?: Array<Record<string, unknown>>;
  error?: string;
}> {
  const { existingIncident, notificationId } = opts;
  const notifications = (existingIncident.notifications || []) as Array<Record<string, unknown>>;
  const entry = notifications.find((n: Record<string, unknown>) => n.id === notificationId);
  
  if (!entry) {
    return { success: false, error: 'Notification not found' };
  }

  const channel = /slack|teams/i.test(entry.channel as string) ? (entry.channel as string) : 'Executive Email';
  const html = buildMajorIncidentStatusEmailHtml({
    name: existingIncident.name as string,
    status: existingIncident.status as string,
    severity: existingIncident.severity as string,
    description: (existingIncident.description as string) || '',
  });

  const dispatched = await dispatchNotification(
    channel === 'Executive Email' ? 'email' : channel.toLowerCase(),
    entry.recipient as string,
    entry.subject as string,
    html,
  );

  const updatedNotifications = notifications.map((n: Record<string, unknown>) =>
    n.id === entry.id
      ? { ...n, status: dispatched.status, ...(dispatched.error ? { error: dispatched.error } : {}), timestamp: new Date().toISOString() }
      : n
  );

  return { success: true, notifications: updatedNotifications };
}
