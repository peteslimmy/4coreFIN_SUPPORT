import type { TicketRecord } from '../types/app';
import { TicketStatus, UserRole } from '../types/app';

export interface TransitionContext {
  actor?: string;
}

export interface TransitionRule {
  from: TicketStatus;
  to: TicketStatus;
  event: string;
  label: string;
  customerFacingLabel?: string;
  roles: UserRole[];
  canTransition?: (ticket: TicketRecord, role: UserRole) => boolean;
  required?: ((ticket: TicketRecord) => boolean)[];
  requiredLabels?: string[];
  mutate?: (ticket: TicketRecord, ctx?: TransitionContext) => Partial<TicketRecord>;
}

// Linear progress-step order used by the UI wizard. The WAITING_* statuses are
// not separate progress steps — they render on the "In Review" step (see
// getTicketStatusStep).
export const TICKET_STATUS_ORDER: TicketStatus[] = [
  TicketStatus.RECEIPT,
  TicketStatus.ASSIGNED,
  TicketStatus.INVESTIGATE,
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.RECEIPT]: 'Receipt',
  [TicketStatus.ASSIGNED]: 'Assigned',
  [TicketStatus.INVESTIGATE]: 'In Review',
  [TicketStatus.WAITING_CUSTOMER]: 'Waiting Customer',
  [TicketStatus.WAITING_PARTNER]: 'Waiting Partner',
  [TicketStatus.WAITING_INTERNAL]: 'Waiting Internal',
  [TicketStatus.RESOLVED]: 'Resolved',
  [TicketStatus.CLOSED]: 'Closed',
};

const LEGACY_STATUS_MAP: Record<string, TicketStatus> = {
  IN_PROGRESS: TicketStatus.ASSIGNED,
  INVESTIGATION: TicketStatus.INVESTIGATE,
};

export function normalizeStatus(status: string | null | undefined): TicketStatus | undefined {
  if (!status) return undefined;
  if (Object.values(TicketStatus).includes(status as TicketStatus)) return status as TicketStatus;
  return LEGACY_STATUS_MAP[status];
}

// Waiting states are variants of active investigation: map them onto the
// INVESTIGATE progress step so the wizard shows "In Review" while waiting.
const WAITING_TO_ACTIVE_STEP: Partial<Record<TicketStatus, TicketStatus>> = {
  [TicketStatus.WAITING_CUSTOMER]: TicketStatus.INVESTIGATE,
  [TicketStatus.WAITING_PARTNER]: TicketStatus.INVESTIGATE,
  [TicketStatus.WAITING_INTERNAL]: TicketStatus.INVESTIGATE,
};

/** Fold the ongoing pause span into slaPausedMs and stop the clock. */
function accumulatePause(ticket: TicketRecord): Partial<TicketRecord> {
  const startedAt = ticket.slaPauseStartedAt ? new Date(ticket.slaPauseStartedAt).getTime() : null;
  if (!startedAt) return { slaPauseStartedAt: null };
  const span = Math.max(0, Date.now() - startedAt);
  return { slaPausedMs: (ticket.slaPausedMs || 0) + span, slaPauseStartedAt: null };
}

export function getTicketStatusStep(status: TicketStatus | string): number {
  if (!status) return 0;
  const canonical = normalizeStatus(status) ?? (status as TicketStatus);
  const stepStatus = WAITING_TO_ACTIVE_STEP[canonical] ?? canonical;
  const idx = TICKET_STATUS_ORDER.indexOf(stepStatus);
  return idx >= 0 ? idx : 0;
}

/** Roles allowed on the BU side (every support tier + legacy + super admin). */
export const BU_AGENT_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.BU_SUPPORT,
  UserRole.BU_SUPPORT_L1,
  UserRole.BU_SUPPORT_L2,
  UserRole.BU_SUPPORT_L3,
];

/** BU-side roles plus the payment-partner role. */
export const BU_AGENT_AND_PARTNER_ROLES: UserRole[] = [...BU_AGENT_ROLES, UserRole.PARTNER];

export const TRANSITIONS: TransitionRule[] = [
  {
    from: TicketStatus.RECEIPT,
    to: TicketStatus.ASSIGNED,
    event: 'ASSIGNED',
    label: 'Assign',
    customerFacingLabel: 'Assigned',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
  },
  {
    from: TicketStatus.ASSIGNED,
    to: TicketStatus.INVESTIGATE,
    event: 'BEGIN_INVESTIGATION',
    label: 'Start Investigation',
    customerFacingLabel: 'In Review',
    roles: BU_AGENT_AND_PARTNER_ROLES,
    canTransition: (t) => !!t.assignedAgentId,
  },
  // Waiting states: entered from INVESTIGATE by BU agents when the case needs
  // an external or internal input before work can continue. Entering a waiting
  // state starts the SLA pause clock; resuming accumulates the paused span so
  // the effective deadline shifts forward without rewriting the original.
  {
    from: TicketStatus.INVESTIGATE,
    to: TicketStatus.WAITING_CUSTOMER,
    event: 'WAIT_CUSTOMER',
    label: 'Wait for Customer',
    customerFacingLabel: 'Waiting on You',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: () => ({ slaPauseStartedAt: new Date().toISOString() }),
  },
  {
    from: TicketStatus.INVESTIGATE,
    to: TicketStatus.WAITING_PARTNER,
    event: 'WAIT_PARTNER',
    label: 'Wait for Partner',
    customerFacingLabel: 'With Payment Partner',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: () => ({ slaPauseStartedAt: new Date().toISOString() }),
  },
  {
    from: TicketStatus.INVESTIGATE,
    to: TicketStatus.WAITING_INTERNAL,
    event: 'WAIT_INTERNAL',
    label: 'Wait Internal',
    customerFacingLabel: 'In Review',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: () => ({ slaPauseStartedAt: new Date().toISOString() }),
  },
  // Resuming: whoever the ticket was waiting on brings it back to INVESTIGATE.
  // WAITING_PARTNER may also be resumed by the partner's own reply.
  {
    from: TicketStatus.WAITING_CUSTOMER,
    to: TicketStatus.INVESTIGATE,
    event: 'CUSTOMER_REPLIED',
    label: 'Customer Replied',
    customerFacingLabel: 'In Review',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: (t) => accumulatePause(t),
  },
  {
    from: TicketStatus.WAITING_PARTNER,
    to: TicketStatus.INVESTIGATE,
    event: 'PARTNER_REPLIED',
    label: 'Partner Replied',
    customerFacingLabel: 'In Review',
    roles: BU_AGENT_AND_PARTNER_ROLES,
    canTransition: () => true,
    mutate: (t) => accumulatePause(t),
  },
  {
    from: TicketStatus.WAITING_INTERNAL,
    to: TicketStatus.INVESTIGATE,
    event: 'INTERNAL_RESUMED',
    label: 'Resume Investigation',
    customerFacingLabel: 'In Review',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: (t) => accumulatePause(t),
  },
  {
    from: TicketStatus.INVESTIGATE,
    to: TicketStatus.RESOLVED,
    event: 'RESOLVE',
    label: 'Resolve',
    customerFacingLabel: 'Decision Made',
    roles: [UserRole.SUPER_ADMIN, UserRole.PARTNER],
    required: [
      (t) => !!t.rcaDetails?.rootCause && t.rcaDetails.rootCause.trim() !== '',
      (t) =>
        !!t.rcaDetails?.correctiveActions && t.rcaDetails.correctiveActions.trim() !== '',
      (t) =>
        !!t.rcaDetails?.preventiveActions && t.rcaDetails.preventiveActions.trim() !== '',
      (t) => !!t.rcaDetails?.preventiveOwner && t.rcaDetails.preventiveOwner.trim() !== '',
      (t) => !!t.rcaDetails?.preventiveDueDate && t.rcaDetails.preventiveDueDate.trim() !== '',
    ],
    requiredLabels: ['Root Cause', 'Corrective Actions', 'Preventive Actions', 'Preventive Owner', 'Preventive Due Date'],
    mutate: (t, ctx) => ({
      rootCause: t.rcaDetails?.rootCause,
      correctiveAction: t.rcaDetails?.correctiveActions,
      rcaDetails: {
        ...(t.rcaDetails || ({} as NonNullable<TicketRecord['rcaDetails']>)),
        resolvedAt: new Date().toISOString(),
        resolvedBy: ctx?.actor || t.rcaDetails?.resolvedBy,
      },
    }),
  },
  {
    from: TicketStatus.RESOLVED,
    to: TicketStatus.CLOSED,
    event: 'CLOSE',
    label: 'Close',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    required: [(t) => t.feedbackScore !== null && t.feedbackScore !== undefined],
    requiredLabels: ['Customer feedback score'],
  },
  {
    from: TicketStatus.RESOLVED,
    to: TicketStatus.INVESTIGATE,
    event: 'REJECT_AND_REOPEN',
    label: 'Reject & Reopen',
    customerFacingLabel: 'In Review',
    roles: BU_AGENT_ROLES,
    mutate: (t) => ({ isEscalated: true, escalationCount: (t.escalationCount ?? 0) + 1 }),
  },
  {
    from: TicketStatus.CLOSED,
    to: TicketStatus.INVESTIGATE,
    event: 'REOPEN',
    label: 'Reopen',
    customerFacingLabel: 'In Review',
    roles: BU_AGENT_ROLES,
  },
  {
    from: TicketStatus.CLOSED,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
  },
  // A merge forces the source ticket to CLOSED regardless of its current
  // (non-terminal) state. Modelled as a distinct event so it can be audited
  // and guarded separately from a normal Close.
  {
    from: TicketStatus.RECEIPT,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
  },
  {
    from: TicketStatus.ASSIGNED,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
  },
  {
    from: TicketStatus.INVESTIGATE,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
  },
  {
    from: TicketStatus.WAITING_CUSTOMER,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: (t) => accumulatePause(t),
  },
  {
    from: TicketStatus.WAITING_PARTNER,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: (t) => accumulatePause(t),
  },
  {
    from: TicketStatus.WAITING_INTERNAL,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
    mutate: (t) => accumulatePause(t),
  },
  {
    from: TicketStatus.RESOLVED,
    to: TicketStatus.CLOSED,
    event: 'MERGE_CLOSE',
    label: 'Mark Merged',
    customerFacingLabel: 'Closed',
    roles: BU_AGENT_ROLES,
    canTransition: () => true,
  },
];

export class TransitionError extends Error {
  public readonly code:
    | 'NOT_ALLOWED'
    | 'NOT_AUTHORIZED'
    | 'REQUIRES_FIELDS'
    | 'ALREADY_IN_STATE';
  public readonly allowed: { to: TicketStatus; label: string }[];
  constructor(
    message: string,
    code: TransitionError['code'],
    allowed: { to: TicketStatus; label: string }[]
  ) {
    super(message);
    this.name = 'TransitionError';
    this.code = code;
    this.allowed = allowed;
  }
}

export function getAvailableTransitions(
  ticket: TicketRecord,
  role: UserRole
): TransitionRule[] {
  const rules = TRANSITIONS.filter((r) => r.from === ticket.status);
  return rules.filter((r) => {
    if (!r.roles.includes(role)) return false;
    if (r.canTransition && !r.canTransition(ticket, role)) return false;
    return true;
  });
}

// Whether a role-allowed transition is fully satisfiable (all required-field
// predicates pass). Use this to decide whether to *enable* or *block* an action.
export function isTransitionSatisfied(ticket: TicketRecord, rule: TransitionRule): boolean {
  const missing = (rule.required || []).filter((req) => !req(ticket));
  return missing.length === 0;
}

/**
 * Human-readable list of the unmet required-field predicates for a rule.
 * Returns labels when provided (e.g. 'Root Cause'), otherwise 'Required field'.
 */
export function getTransitionBlockers(ticket: TicketRecord, rule: TransitionRule): string[] {
  return (rule.required || [])
    .map((req, i) => ({ ok: req(ticket), label: rule.requiredLabels?.[i] }))
    .filter((entry) => !entry.ok)
    .map((entry) => entry.label || 'Required field');
}

/**
 * All blockers across the transitions the role may take from this state
 * (excluding rules already in the target state). Used to surface "why can't I
 * move this ticket forward" hints in the UI.
 */
export function getAllTransitionBlockers(ticket: TicketRecord, role: UserRole): string[] {
  const blockers = new Set<string>();
  for (const rule of getAvailableTransitions(ticket, role)) {
    for (const label of getTransitionBlockers(ticket, rule)) blockers.add(label);
  }
  return [...blockers];
}

export function canTransition(
  ticket: TicketRecord,
  toStatus: TicketStatus,
  role: UserRole
): boolean {
  return getAvailableTransitions(ticket, role).some((r) => r.to === toStatus);
}

export function applyTransition<T extends TicketRecord>(
  ticket: T,
  toStatus: TicketStatus,
  role: UserRole,
  ctx?: TransitionContext
): T {
  const available = getAvailableTransitions(ticket, role);
  const rule = available.find((r) => r.to === toStatus);

  if (!rule) {
    const allowed = available.map((r) => ({ to: r.to, label: r.label }));
    throw new TransitionError(
      `Transition ${ticket.status} → ${toStatus} is not allowed for role ${role}`,
      'NOT_ALLOWED',
      allowed
    );
  }

  const missing = (rule.required || []).filter((req) => !req(ticket));
  if (missing.length > 0) {
    throw new TransitionError(
      `Transition ${ticket.status} → ${toStatus} requires additional fields to be completed first.`,
      'REQUIRES_FIELDS',
      []
    );
  }

  const mutated = {
    ...ticket,
    status: toStatus,
    ...(rule.mutate ? rule.mutate(ticket, ctx) : {}),
  };
  return mutated as T;
}

export function isTerminal(status: TicketStatus | string): boolean {
  return status === TicketStatus.CLOSED;
}
