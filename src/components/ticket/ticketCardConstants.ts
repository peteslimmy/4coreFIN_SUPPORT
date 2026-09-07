import { TicketPriority, TicketStatus, type TicketRecord } from '../../types/app';
import { SLA_AT_RISK_PCT, FALLBACK_SLA_DURATION_MS } from '../../lib/constants';

export function getSubmitterName(ticket: TicketRecord): string {
  if (ticket.submittedByName && ticket.submittedByName.trim() !== '') return ticket.submittedByName;
  if (ticket.submittedBy === 'BU_SUPPORT') return 'BU Support';
  if (ticket.submittedBy === 'CUSTOMER') return 'Customer';
  return '-';
}

export function getPriorityDisplay(priority: TicketPriority): { label: string; className: string } {
  const map: Record<TicketPriority, { label: string; className: string }> = {
    CRITICAL: { label: 'CRITICAL', className: 'bg-error text-error-dark' },
    HIGH: { label: 'HIGH', className: 'bg-warning text-warning-dark' },
    MEDIUM: { label: 'MEDIUM', className: 'bg-info text-info-dark' },
    LOW: { label: 'LOW', className: 'bg-success text-success-dark' },
  };
  return map[priority] || map.LOW;
}

export function getAgeDisplay(createdAt: string | undefined): string {
  if (!createdAt) return '-';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'just now';
}

export function formatCardDate(createdAt: string | undefined): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function getSlaState(deadlineMs: number, now: number, createdAt?: string, status?: TicketStatus) {
    // Don't calculate SLA for closed/resolved tickets
    if (status === TicketStatus.CLOSED || status === TicketStatus.RESOLVED) {
      return { breached: false, atRisk: false };
    }
    
    const total = createdAt ? Math.max(1, deadlineMs - new Date(createdAt).getTime()) : FALLBACK_SLA_DURATION_MS;
    const start = deadlineMs - total;
    const elapsed = now - start;
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const remaining = deadlineMs - now;
    if (remaining <= 0) return { breached: true, atRisk: false };
    if (pct > SLA_AT_RISK_PCT) return { breached: false, atRisk: true };
    return { breached: false, atRisk: false };
}