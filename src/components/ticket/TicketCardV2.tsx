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
      <span className="inline-flex h-[22px] items-center rounded-full border border-[#fecdd3] bg-[#ffe7eb] px-[8px] text-[10px] font-semibold text-[#e11d48] shrink-0 gap-[4px]">
        <span className="h-[6px] w-[6px] rounded-full bg-[#be123c]" />
        Breached-{breachHours}h
      </span>
    );
  }

  if (status === 'CLOSED') {
    return (
      <span className="inline-flex h-[22px] items-center rounded-full border border-[#dbe3ec] bg-[#f1f5f9] px-[8px] text-[10px] font-medium text-[#334155] shrink-0">
        Closed
      </span>
    );
  }

  const dotStyles: Record<string, string> = {
    RECEIPT: 'bg-[#1D4ED8]',
    ASSIGNED: 'bg-[#92400E]',
    INVESTIGATE: 'bg-[#6D3FA0]',
    REOPENED: 'bg-[#1D4ED8]',
    WAITING_CUSTOMER: 'bg-[#92400E]',
    WAITING_PARTNER: 'bg-[#92400E]',
    WAITING_INTERNAL: 'bg-[#92400E]',
    RESOLVED: 'bg-[#047857]',
  };
  const dotColor = dotStyles[status] || 'bg-[#047857]';

  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-[#86efac] bg-[#f0fdf4] px-[8px] text-[10px] font-medium text-[#047857] shrink-0 gap-[4px]">
      <span className={cn('h-[6px] w-[6px] rounded-full', dotColor)} />
      {displayLabel}
    </span>
  );
}

function PriorityPill({ priority }: { priority: TicketPriority }) {
  const styles: Record<TicketPriority, { bg: string; text: string }> = {
    CRITICAL: { bg: 'bg-[#fff1f2]', text: 'text-[#dc2626]' },
    HIGH: { bg: 'bg-[#fef3c7]', text: 'text-[#a16207]' },
    MEDIUM: { bg: 'bg-[#f1f5f9]', text: 'text-[#334155]' },
    LOW: { bg: 'bg-[#f1f5f9]', text: 'text-[#334155]' },
  };
  const s = styles[priority];
  return (
    <span className={cn('inline-flex h-[20px] items-center rounded-[4px] px-[6px] text-[10px] font-semibold', s.bg, s.text)}>
      {priority}
      {priority !== 'MEDIUM' && priority !== 'LOW' && (
        <span className="ml-[2px]">PRIORITY</span>
      )}
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
        'border-b border-[#e5e7eb]',
        'px-[8px] pb-[13px] pt-[15px]',
        'transition-colors duration-100',
        'focus:outline-none',
        'focus-visible:bg-[#f8fafc]',
        isActive && 'bg-[#f5f8fc]',
        isSelected && 'bg-[#f0f4ff]',
        isFocused && 'bg-[#f8fafc]',
        !isActive && !isSelected && !isFocused && 'hover:bg-[#fafbfc]',
      )}
    >
      {/* ROW 1: ID + Status */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] font-medium leading-[12px] text-[#486581]">
          {ticket.id}
        </span>
        <StatusPill
          status={ticket.status}
          breachHours={breachHours}
        />
      </div>

      {/* ROW 2: Title + Priority + Date */}
      <div className={cn('mt-[6px] flex items-center justify-between gap-2', isCompact && 'mt-[4px]')}>
        <h3 className="truncate pr-[4px] text-[12px] font-semibold leading-[12px] text-[#0f172a] min-w-0">
          {displayName}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <PriorityPill priority={ticket.priority} />
        </div>
      </div>
    </button>
  );
});
