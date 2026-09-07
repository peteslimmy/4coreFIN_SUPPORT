import { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { type TicketRecord, TicketStatus } from '../../types/app';
import { parseSlaCountdown } from '../../lib/utils';
import { getSubmitterName, getPriorityDisplay, getAgeDisplay, getSlaState } from './ticketCardConstants';
import StatusBadge from '../ui/StatusBadge';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { cn } from '../../lib/utils';

export interface TicketCardProps {
  ticket: TicketRecord;
  isActive: boolean;
  isSelected: boolean;
  isFocused?: boolean;
  now?: number;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onFocus?: () => void;
  density?: 'comfortable' | 'compact';
  key?: string;
}

export default function TicketCard({ ticket, isActive, isSelected, isFocused, now: nowProp, onSelect, onToggleSelect, onFocus, density = 'comfortable' }: TicketCardProps) {
  const [internalNow, setInternalNow] = useState(() => Date.now());
  const now = nowProp ?? internalNow;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (nowProp !== undefined) return; // parent controls the timer
    const id = setInterval(() => setInternalNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nowProp]);
  
  const [copied, setCopied] = useState(false);

  const deadlineMs = new Date(ticket.slaDeadline).getTime();
  const { breached, atRisk } = getSlaState(deadlineMs, now, ticket.createdAt, ticket.status);
  const priorityDisplay = getPriorityDisplay(ticket.priority);
  const isCompact = density === 'compact';

  // Keyboard shortcuts for ticket actions
  useKeyboardShortcuts([
    { key: 'b', handler: () => onSelect(ticket.id) }, // 'b' = breach details (open ticket)
    { key: 'a', ctrl: true, handler: () => onToggleSelect(ticket.id) }, // Ctrl+A = select/deselect
  ], !isCompact); // Disable in compact mode to avoid conflicts with list navigation

  // Handle focus for keyboard navigation
  useEffect(() => {
    if (onFocus && isFocused) {
      onFocus();
    }
  }, [onFocus, isFocused]);

  const handleCopy = () => {
    navigator.clipboard.writeText(ticket.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

return (
    <motion.button
      type="button"
      layout={!reduceMotion}
      initial={!reduceMotion ? { opacity: 0, y: 8 } : undefined}
      animate={!reduceMotion ? { opacity: 1, y: 0 } : undefined}
      exit={!reduceMotion ? { opacity: 0, y: -8 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={() => onSelect(ticket.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ticket.id); } }}
      onFocus={onFocus}
      tabIndex={isFocused ? 0 : -1}
      aria-label={`View ticket ${ticket.id}`}
      title={ticket.customerName || getSubmitterName(ticket)}
      className={cn(
        'group relative surface-card transition-all duration-200 overflow-hidden cursor-pointer',
        isActive && 'bg-primary/5 shadow-card-hover ring-1 ring-accent/20',
        isSelected && 'bg-primary/5 ring-2 ring-accent/30',
        isFocused && 'bg-primary/5 ring-2 ring-primary/20',
        !isActive && !isSelected && !isFocused && 'hover:shadow-card-hover hover:bg-surface-hover hover:-translate-y-0.5'
      )}
    >
      {/* SLA Breach Banner */}
      {breached && (
        <div className="absolute inset-x-0 top-0 bg-rose-50/90 border-l-4 border-rose-700 pulse animate-pulse">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-700" aria-hidden="true"></span>
            <span className="text-ticket-caption text-rose-700 font-semibold">SLA BREACHED</span>
          </div>
        </div>
      )}
      
      <div className={cn(
        isCompact ? 'px-3 py-2' : 'px-3 py-2.5',
        'pt-[26px]'
      )}>
        {/* PRIMARY: Customer Name + Business Unit */}
        <div className="mb-1.5">
          <p className="text-ticket-label text-text-primary truncate max-w-[180px]">
            {getSubmitterName(ticket)}
          </p>
          <p className="text-ticket-caption text-text-muted truncate">
            {ticket.businessUnit} · {ticket.category}
          </p>
        </div>
            
        {/* SECONDARY: Ticket ID + Timestamp */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="font-numeric text-ticket-caption text-text-secondary">
                {ticket.id}
              </span>
              <button
                onClick={handleCopy}
                className={cn(
                  'p-1 rounded hover:bg-surface-hover transition-colors',
                  copied && 'bg-success/20'
                )}
                aria-label={copied ? 'Copied!' : 'Copy ticket ID'}
                title={copied ? 'Copied!' : 'Copy ticket ID'}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <time className="text-ticket-caption text-text-muted">
            {getAgeDisplay(ticket.createdAt)}
          </time>
        </div>

        {/* FOOTER: Priority + Status Pills */}
        <div className="flex items-center justify-between gap-2">
          {/* Priority Pill */}
          <div className="flex items-center gap-1.5 text-ticket-caption">
            <span className={`w-2 h-2 rounded-full ${
              ticket.priority === 'CRITICAL' ? 'bg-error/15 text-error' :
              ticket.priority === 'HIGH' ? 'bg-warning/15 text-warning' :
              ticket.priority === 'MEDIUM' ? 'bg-info/15 text-info' :
              'bg-success/15 text-success'
            }`} aria-hidden="true"></span>
            <span className="font-medium ${
              ticket.priority === 'CRITICAL' ? 'text-error' :
              ticket.priority === 'HIGH' ? 'text-warning' :
              ticket.priority === 'MEDIUM' ? 'text-info' :
              'text-success'
            }">
              {ticket.priority}
            </span>
          </div>
          
          {/* Status Pill */}
          <StatusBadge status={ticket.status} size="sm" />
        </div>
      </div>
    </motion.button>
  );
 }