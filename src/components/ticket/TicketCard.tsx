import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { type TicketRecord } from '../../types/app';
import { formatSlaCountdown } from '../../lib/utils';
import { getSubmitterName, getPriorityDisplay, getAgeDisplay, getSlaState } from './ticketCardConstants';
import { SLA_LIST_REFRESH_MS } from '../../lib/constants';

/* ─── Props ─────────────────────────────────────────────────────────── */

export interface TicketCardProps {
  ticket: TicketRecord;
  isActive: boolean;
  isSelected: boolean;
  now?: number;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  density?: 'comfortable' | 'compact';
  key?: string;
}

/* ─── SLA Pill ──────────────────────────────────────────────────────── */

function SlaPill({ breached, atRisk, deadlineMs, now }: { breached: boolean; atRisk: boolean; deadlineMs: number; now: number }) {
  if (breached) {
    return (
      <div className="mt-sm flex items-center justify-between p-sm rounded-lg bg-surface-container-low border border-error-container hover:-translate-y-0.5 hover:bg-error/20">
        <div className="flex items-center gap-2 text-on-error-container">
          <span className="material-symbols-outlined text-[12px]">warning</span>
          <span className="font-semibold text-[10px] uppercase tracking-wider">Breached</span>
        </div>
        <div className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-bold text-[12px]">
          {formatSlaCountdown(now, deadlineMs)}
        </div>
      </div>
    );
  }
  if (atRisk) {
    return (
      <div className="mt-sm flex items-center justify-between p-sm rounded-lg bg-surface-container-low border border-warning-container hover:-translate-y-0.5 hover:bg-warning/20">
        <div className="flex items-center gap-2 text-on-warning-container">
          <span className="material-symbols-outlined text-[12px]">warning</span>
          <span className="font-semibold text-[10px] uppercase tracking-wider">At Risk</span>
        </div>
        <div className="px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container font-bold text-[12px]">
          {formatSlaCountdown(now, deadlineMs)}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-sm flex items-center justify-between p-sm rounded-lg bg-surface-container-low border border-success-container hover:-translate-y-0.5 hover:bg-success/20">
      <div className="flex items-center gap-2 text-on-success-container">
        <span className="material-symbols-outlined text-[12px]">check_circle</span>
        <span className="font-semibold text-[10px] uppercase tracking-wider">On Track</span>
      </div>
      <div className="px-2 py-0.5 rounded-full bg-success-container text-on-success-container font-bold text-[12px]">
        {formatSlaCountdown(now, deadlineMs)}
      </div>
    </div>
  );
}

/* ─── TicketCard ────────────────────────────────────────────────────── */

export default function TicketCard({ ticket, isActive, isSelected, now: nowProp, onSelect, onToggleSelect, density = 'comfortable' }: TicketCardProps) {
  const [internalNow, setInternalNow] = useState(() => Date.now());
  const now = nowProp ?? internalNow;

  useEffect(() => {
    if (nowProp !== undefined) return; // parent controls the timer
    const id = setInterval(() => setInternalNow(Date.now()), SLA_LIST_REFRESH_MS);
    return () => clearInterval(id);
  }, [nowProp]);
  const deadlineMs = new Date(ticket.slaDeadline).getTime();
  const { breached, atRisk } = getSlaState(deadlineMs, now, ticket.createdAt);
  const priorityDisplay = getPriorityDisplay(ticket.priority);
  const isCompact = density === 'compact';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={() => onSelect(ticket.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ticket.id); } }}
      role="button"
      tabIndex={0}
      aria-label={`View ticket ${ticket.id}`}
      className={`group relative bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm transition-all duration-200 overflow-hidden cursor-pointer ${
        isActive
          ? 'bg-primary/5 shadow-card-hover'
          : isSelected
            ? 'bg-primary/5 ring-2 ring-accent/30'
            : 'hover:shadow-card-hover hover:bg-surface-hover hover:scale-[1.01]'
      }`}
    >
      <div className={isCompact ? 'px-3 py-2' : 'p-md'}>
        {/* Header: ID + Status + Priority */}
        <div className="flex flex-col gap-sm">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <p className="text-[12px] font-medium text-text-secondary">{ticket.id}</p>
            </div>
            <div className="flex flex-col items-end gap-sm">
              <span className="px-2 py-0.5 rounded-sm bg-primary-fixed text-on-primary-fixed-variant font-semibold text-[10px] uppercase tracking-wider">{ticket.status}</span>
              <div className="flex items-center gap-2 hover:-translate-y-0.5">
                <span className="w-2 h-2 rounded-full bg-tertiary-container hover:w-3 hover:h-3"></span>
                <span className="font-semibold text-[10px] text-on-surface-variant uppercase tracking-wider hover:text-primary hover:font-medium">{priorityDisplay.label}</span>
              </div>
            </div>
          </div>

          {/* Customer & Time */}
          <div className="flex justify-between items-center mt-sm">
            <p className="text-[14px] font-medium text-text-primary">{getSubmitterName(ticket)}</p>
            <p className="text-[11px] text-text-secondary">{getAgeDisplay(ticket.createdAt)}</p>
          </div>

          {/* SLA Pill */}
          <SlaPill breached={breached} atRisk={atRisk} deadlineMs={deadlineMs} now={now} />
        </div>
      </div>

      {/* Selection checkbox */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(ticket.id); }}
        aria-label={isSelected ? `Deselect ticket ${ticket.id}` : `Select ticket ${ticket.id}`}
        aria-pressed={isSelected}
        className={`absolute top-2 right-2 w-[36px] h-[36px] p-1 rounded border transition-all duration-150 focus-ring ${
          isSelected
            ? 'bg-primary border-primary text-[#fff] opacity-100'
            : 'bg-surface-card border-border text-transparent opacity-0 group-hover:opacity-100 hover:border-accent hover:scale-[1.05]'
        }`}
      >
        <Check className="w-3 h-3" strokeWidth={3} />
      </button>
    </motion.div>
  );
}
