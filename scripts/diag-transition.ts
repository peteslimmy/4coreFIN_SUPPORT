import { getAvailableTransitions, getTransitionBlockers, applyTransition } from '../src/lib/ticketStateMachine';
import { TicketStatus, type TicketRecord } from '../src/types/app';

const base = {
  id: 't1', ticketId: 'TCK-1', title: '', description: '',
  customerName: 'C', customerEmail: 'c@x.test', businessUnit: 'POS',
  priority: 'HIGH', status: TicketStatus.INVESTIGATE,
  createdAt: new Date().toISOString(), slaDeadline: null,
  isEscalated: false, escalationCount: 0, watchers: [],
} as unknown as TicketRecord;

const rcaDetails = {
  rootCause: 'rc', contributingFactors: 'n', correctiveActions: 'ca',
  preventiveActions: 'pa', preventiveOwner: 'P P', preventiveDueDate: new Date().toISOString(),
};

for (const label of ['no-rca', 'with-rca']) {
  const t = label === 'with-rca'
    ? { ...base, rootCause: 'rc', correctiveAction: 'ca', rcaDetails }
    : base;
  const avail = getAvailableTransitions(t, 'PARTNER');
  const rule = avail.find((r) => r.to === TicketStatus.RESOLVED);
  console.log(`--- ${label}`);
  console.log('available:', avail.map((r) => r.to).join(','));
  if (rule) {
    console.log('blockers:', JSON.stringify(getTransitionBlockers(t, rule)));
    try {
      const out = applyTransition(t, TicketStatus.RESOLVED, 'PARTNER', { actor: 'diag' });
      console.log('applyTransition OK ->', out.status);
    } catch (e: any) {
      console.log('applyTransition FAILED:', e.message);
    }
  } else {
    console.log('RESOLVED not in available set for PARTNER');
  }
}
