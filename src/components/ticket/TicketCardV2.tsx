import React, { useEffect } from 'react';
import { type TicketRecord, TicketPriority } from '../../types/app';
import { getSubmitterName } from './ticketCardConstants';
import { cn } from '../../lib/utils';
import { useSla } from '../../lib/slaEngine';
import { useSlaTimer } from '../../context/SlaTimerContext';
import { useApp } from '../../context/AppContext';

export interface TicketCardV2Props {
  ticket: TicketRecord;
  isActive: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onFocus?: () => void;
  density?: 'comfortable' | 'compact';
}

function StatusPill({ status, breachHours }: { status: string; breachHours?: number }) {
  const label = status.replace(/_/g, ' ');
  const displayLabel = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  const isBreached = breachHours !== undefined && breachHours > 0;

  if (isBreached) {
    return (
      <span className="inline-flex h-[22px] items-center rounded-full bg-sla-breach-bg px-2 text-[11px] font-semibold text-sla-breach-text shrink-0 gap-1.5 ring-1 ring-inset ring-sla-breach-border/60">
        <span className="h-1.5 w-1.5 rounded-full bg-sla-breach" />
        Breached · {breachHours}h
      </span>
    );
  }

  if (status === 'CLOSED') {
    return (
      <span className="inline-flex h-[22px] items-center rounded-full bg-surface-hover px-2 text-[11px] font-medium text-text-muted shrink-0">
        Closed
      </span>
    );
  }

  const dotStyles: Record<string, string> = {
    RECEIPT: 'bg-info',
    ASSIGNED: 'bg-warning',
    INVESTIGATE: 'bg-chart-purple',
    REOPENED: 'bg-info',
    WAITING_CUSTOMER: 'bg-warning',
    WAITING_PARTNER: 'bg-warning',
    WAITING_INTERNAL: 'bg-warning',
    RESOLVED: 'bg-success',
  };
  const dotColor = dotStyles[status] || 'bg-success';

  return (
    <span className="inline-flex h-[22px] items-center rounded-full bg-success-light px-2 text-[11px] font-medium text-success-dark shrink-0 gap-1.5 ring-1 ring-inset ring-success/20">
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
      {displayLabel}
    </span>
  );
}

function PriorityPill({ priority }: { priority: TicketPriority }) {
  const styles: Record<TicketPriority, { bg: string; text: string }> = {
    CRITICAL: { bg: 'bg-error-light', text: 'text-error-dark' },
    HIGH: { bg: 'bg-warning-light', text: 'text-warning-dark' },
    MEDIUM: { bg: 'bg-surface-hover', text: 'text-text-secondary' },
    LOW: { bg: 'bg-surface-hover', text: 'text-text-muted' },
  };
  const s = styles[priority];
  return (
    <span className={cn('inline-flex h-[20px] items-center rounded-md px-1.5 text-[11px] font-bold tracking-wide', s.bg, s.text)}>
      {priority}
    </span>
  );
}

export default React.memo(function TicketCardV2({
  ticket,
  isActive,
  isSelected,
  isFocused,
  onSelect,
  onToggleSelect: _onToggleSelect,
  onFocus,
  density = 'comfortable',
}: TicketCardV2Props) {
  const isCompact = density === 'compact';
  const { now } = useSlaTimer();

  const { slaRules, holidays } = useApp();
  const slaConfig = {
    slaRules,
    holidays,
    priorityFallbackHours: { CRITICAL: 1, HIGH: 4, MEDIUM: 8, LOW: 24 },
  };

  const sla = useSla(ticket, slaConfig);

  const breachHours = sla.breached && sla.deadline
    ? Math.max(1, Math.floor((now - sla.deadline.getTime()) / 3600000))
    : undefined;

  useEffect(() => {
    if (onFocus && isFocused) {
      onFocus();
    }
  }, [onFocus, isFocused]);

  const displayName = ticket.customerName || getSubmitterName(ticket);

  return (
    <button
      type="button"
      onClick={() => onSelect(ticket.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ticket.id); } }}
      onFocus={onFocus}
      tabIndex={isFocused ? 0 : -1}
      aria-label={`View ticket ${ticket.id}`}
      title={displayName}
      className={cn(
        'relative block w-full text-left',
        'px-4 py-3.5',
        'transition-colors duration-150',
        'focus:outline-none',
        // Hairline divider + active accent rail
        'border-b border-border-subtle',
        'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-primary before:transition-opacity before:duration-150 before:opacity-0',
        isActive && 'bg-primary-light/60 before:opacity-100',
        isSelected && 'bg-info-light/50',
        isFocused && 'bg-surface-hover',
        !isActive && !isSelected && !isFocused && 'hover:bg-surface-hover/60',
      )}
    >
      {/* ROW 1: ID + Status */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] font-medium leading-4 text-text-muted tracking-tight">
          {ticket.id}
        </span>
        <StatusPill
          status={ticket.status}
          breachHours={breachHours}
        />
      </div>

      {/* ROW 2: Title + Priority */}
      <div className={cn('mt-2 flex items-center justify-between gap-2', isCompact && 'mt-1')}>
        <h3 className="truncate pr-1 text-[13px] font-semibold leading-[18px] text-text-primary min-w-0">
          {displayName}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <PriorityPill priority={ticket.priority} />
        </div>
      </div>
    </button>
  );
});
