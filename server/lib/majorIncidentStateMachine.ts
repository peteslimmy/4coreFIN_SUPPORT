/**
 * Major Incident lifecycle rules shared by the server routes and (mirrored)
 * the client UI. Guards are enforced here so status changes are validated.
 *
 * State model:
 *   DECLARED → INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED → CLOSED
 *
 * - DECLARED → INVESTIGATING acknowledges the incident & assigns an owner.
 * - RESOLVED requires the technical root cause + preventive owner to be set.
 * - CLOSED requires a finalized (non-draft) PIR.
 * - CLOSED may only be reopened into MONITORING (verified regression window).
 * - Legacy rows written as "MITIGATED" are treated as MONITORING.
 */

export const MAJOR_INCIDENT_STATUS_ORDER = ['DECLARED', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED'] as const;
export type MajorIncidentStatus = typeof MAJOR_INCIDENT_STATUS_ORDER[number];

export const MAJOR_INCIDENT_ALIASES: Record<string, 'MONITORING'> = {
  MITIGATED: 'MONITORING',
};

export function normalizeStatus(status?: string | null): MajorIncidentStatus {
  const raw = status || 'DECLARED';
  const alias = MAJOR_INCIDENT_ALIASES[raw];
  if (alias) return alias;
  return (MAJOR_INCIDENT_STATUS_ORDER as readonly string[]).includes(raw) ? (raw as MajorIncidentStatus) : 'DECLARED';
}

export interface IncidentLike {
  status?: string | null;
  severity?: string;
  pir?: {
    rootCauseSummary?: string;
    preventiveOwner?: string;
    draft?: boolean;
  } | null;
}

/** Statuses reachable (before guard checks) from the current state. */
export function nextStatuses(incident: IncidentLike): MajorIncidentStatus[] {
  switch (normalizeStatus(incident.status)) {
    case 'DECLARED':
      return ['INVESTIGATING'];
    case 'INVESTIGATING':
      return ['IDENTIFIED', 'MONITORING', 'RESOLVED'];
    case 'IDENTIFIED':
      return ['MONITORING', 'RESOLVED'];
    case 'MONITORING':
      return ['RESOLVED'];
    case 'RESOLVED':
      return ['CLOSED', 'MONITORING'];
    case 'CLOSED':
      return ['MONITORING'];
    default:
      return [];
  }
}

/** Human reason RESOLVED cannot be reached yet, or null when allowed. */
export function resolveRequires(incident: IncidentLike): string | null {
  const pir = incident.pir;
  if (!pir?.rootCauseSummary || !String(pir.rootCauseSummary).trim()) {
    return 'Add the technical root cause before marking the incident RESOLVED.';
  }
  if (!pir?.preventiveOwner || !String(pir.preventiveOwner).trim()) {
    return 'Set the preventive-actions owner before marking the incident RESOLVED.';
  }
  return null;
}

/** Human reason CLOSED cannot be reached yet, or null when allowed. */
export function closeRequires(incident: IncidentLike): string | null {
  if (normalizeStatus(incident.status) !== 'RESOLVED') {
    return 'Mark the incident RESOLVED before closing it.';
  }
  const blocker = resolveRequires(incident);
  if (blocker) return blocker;
  if (incident.pir?.draft !== false) {
    return 'Finalize the Post-Incident Review (PIR) before closing the incident.';
  }
  return null;
}

/** True when moving to `to` is structurally possible AND guard conditions pass. */
export function canTransition(incident: IncidentLike, to: string): boolean {
  if (!nextStatuses(incident).includes(to as MajorIncidentStatus)) return false;
  if (to === 'RESOLVED') return resolveRequires(incident) === null;
  if (to === 'CLOSED') return closeRequires(incident) === null;
  return true;
}

/** Why a proposed transition is blocked, or null when allowed. */
export function transitionBlocked(incident: IncidentLike, to: string): string | null {
  if (!nextStatuses(incident).includes(to as MajorIncidentStatus)) {
    return `Cannot move from ${normalizeStatus(incident.status)} directly to ${to}.`;
  }
  if (to === 'RESOLVED') return resolveRequires(incident);
  if (to === 'CLOSED') return closeRequires(incident);
  return null;
}

export function isActiveStatus(status?: string | null): boolean {
  const s = normalizeStatus(status);
  return s === 'DECLARED' || s === 'INVESTIGATING' || s === 'IDENTIFIED' || s === 'MONITORING';
}

export function severityJustificationRequired(severity?: string | null): boolean {
  return severity === 'CRITICAL';
}