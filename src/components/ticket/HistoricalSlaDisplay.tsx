import { TicketRecord } from '../../types/app';
import { parseSlaCountdown } from '../../lib/utils';

interface HistoricalSlaDisplayProps {
  ticket: TicketRecord;
}

export function HistoricalSlaDisplay({ ticket }: HistoricalSlaDisplayProps) {
  // Determine completion time based on status
  const completedAt = ticket.status === 'RESOLVED' 
    ? ticket.rcaDetails?.resolvedAt 
    : ticket.status === 'CLOSED' 
      ? ticket['closedAt'] 
      : null;

  if (!completedAt) return null;

  // Determine if breached (completed after SLA deadline)
  const completedAtMs = new Date(completedAt).getTime();
  const deadlineMs = new Date(ticket.slaDeadline).getTime();
  const isBreached = completedAtMs > deadlineMs;
   
  // Calculate actual elapsed time
  const createdAtMs = new Date(ticket.createdAt).getTime();
  const elapsedHours = Math.max(0, (completedAtMs - createdAtMs) / (1000 * 60 * 60));
   
  // Calculate SLA target hours
  const slaTargetHours = Math.max(0, (deadlineMs - createdAtMs) / (1000 * 60 * 60));
  const varianceHours = elapsedHours - slaTargetHours;
   
  // Format the historical SLA information
  const slaStatus = isBreached ? 'BREACHED' : 'MET';
  const slaIcon = isBreached ? 'schedule' : 'check_circle';
  const slaAction = ticket.status === 'RESOLVED' ? 'Resolved' : 'Closed';

  return (
    <div className={`flex items-center gap-1 px-1 py-0.5 rounded border max-text-10 ${
      isBreached 
        ? 'bg-sla-breach-bg border-sla-breach text-sla-breach' 
        : 'bg-sla-healthy-bg border-sla-healthy text-sla-healthy'
    }`}>
      {/* Colored dot indicator */}
      <span className={`w-1.5 h-1.5 rounded-full ${
        isBreached ? 'text-sla-breach' : 'text-sla-healthy'
      }`} aria-hidden="true"></span>
      <div className="flex flex-col min-w-0">
        <p className="text-micro font-medium text-text-secondary truncate">
          SLA {slaStatus} — {slaAction}
          <span className="font-mono tabular-nums ml-1">
            {varianceHours !== 0 
              ? `${varianceHours > 0 ? '+' : ''}${varianceHours.toFixed(1)}h` 
              : '0h'}
          </span>
        </p>
        {ticket.slaPolicyVersion && (
          <p className="text-micro text-text-muted truncate">
            Policy: {ticket.slaPolicyVersion}{ticket.partnerOrgId ? ' (Partner)' : ' (Default)'}
          </p>
        )}
      </div>
    </div>
  );
}