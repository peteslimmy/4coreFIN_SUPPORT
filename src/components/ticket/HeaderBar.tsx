import React, { useState, useRef, useEffect } from 'react';
import { Bell, MoreHorizontal, AlertTriangle, GitMerge, Archive, Shield } from 'lucide-react';
import { TicketRecord, UserRole } from '../../types/app';
import { useApp } from '../../context/AppContext';
import PriorityBadge from '../ticket/PriorityBadge';
import StatusBadge from '../ui/StatusBadge';
import { useSla } from '../../lib/slaEngine';
import { isBuSupportRole } from '../../lib/rbac';

interface HeaderBarProps {
  ticket: TicketRecord;
  onEscalate: () => void;
  onMerge: () => void;
  onArchive: (id: string) => void;
  onDeclareMajorIncident: () => void;
  onWatchToggle: () => void;
  isWatching: boolean;
}

export function HeaderBar({
  ticket,
  onEscalate,
  onMerge,
  onArchive,
  onDeclareMajorIncident,
  onWatchToggle,
  isWatching,
}: HeaderBarProps) {
  const { currentRole, slaRules, holidays } = useApp();
  const slaConfig = {
    slaRules,
    holidays,
    priorityFallbackHours: { CRITICAL: 1, HIGH: 4, MEDIUM: 8, LOW: 24 },
  };
  const sla = useSla(ticket, slaConfig);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const showEscalate = currentRole === UserRole.BU_SUPPORT;
  const showMerge = currentRole === UserRole.BU_SUPPORT;
  const showArchive = currentRole === UserRole.BU_SUPPORT || currentRole === UserRole.SUPER_ADMIN || currentRole === UserRole.EXECUTIVE;
  const showMajorIncident = isBuSupportRole(currentRole) || currentRole === UserRole.SUPER_ADMIN;

  const hasMenuItems = showEscalate || showMerge || showArchive || showMajorIncident;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const ownerName = ticket.assignedAgentId
    ? ticket.assignedAgentId.replace(/ Team\s*$/i, '')
    : ticket.partner;
  const customerName = ticket.customerName || ownerName;
  const slaTone = sla.breached
    ? 'bg-error-light text-error-dark'
    : sla.atRisk
      ? 'bg-warning-light text-warning-dark'
      : 'bg-surface-hover text-text-secondary';
  const slaSourceHint = sla.source === 'rule'
    ? 'Deadline set by a configured SLA category rule'
    : 'No category rule matched; using the priority fallback SLA';

  return (
    <header className="sticky top-0 z-10 shrink-0 px-4 pt-3.5 pb-3 bg-surface-elevated/95 backdrop-blur-sm border-b border-border">
      {/* Row 1 — identity: customer first, then ID + badges */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <h2 className="font-heading font-semibold text-[15px] text-text-primary truncate min-w-0">
            {customerName}
          </h2>
          <span className="font-mono text-[11px] text-text-muted tracking-tight shrink-0">{ticket.id}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <StatusBadge status={ticket.status} size="xs" />
          <PriorityBadge priority={ticket.priority} />
          {ticket.isEscalated && (
            <span className="inline-flex items-center px-2 py-0.5 bg-error-light text-error-dark rounded-full text-[11px] font-semibold">
              Escalated
            </span>
          )}
          {ticket.duplicateOf && (
            <span className="px-2 py-0.5 bg-surface-hover text-text-secondary rounded-full text-[11px] font-semibold" title={`Duplicate of ${ticket.duplicateOf}`}>
              Dup of {ticket.duplicateOf}
            </span>
          )}
          {sla.deadline && (
            <span
              className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-semibold font-mono tabular-nums ${slaTone}`}
              title={slaSourceHint}
            >
              <AlertTriangle className={`w-3 h-3 ${sla.breached ? 'text-error' : sla.atRisk ? 'text-warning' : 'text-text-muted opacity-60'}`} />
              {sla.formattedShort}
            </span>
          )}
        </div>
      </div>

      {/* Row 2 — actions + owner */}
      <div className="flex items-center justify-between gap-2 mt-2.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onWatchToggle}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition focus-ring cursor-pointer ${
              isWatching
                ? 'bg-primary/10 text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {isWatching ? (
              <>
                <Bell className="w-3.5 h-3.5 fill-current" />
                Watching
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5" />
                Watch
              </>
            )}
          </button>

          {hasMenuItems && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring"
                aria-label="More actions"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-surface-elevated border border-border rounded-lg shadow-dropdown z-50 py-1">
                  {showEscalate && (
                    <button
                      type="button"
                      onClick={() => { onEscalate(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                      Escalate
                    </button>
                  )}
                  {showMerge && (
                    <button
                      type="button"
                      onClick={() => { onMerge(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <GitMerge className="w-3.5 h-3.5 text-text-muted" />
                      Merge Ticket
                    </button>
                  )}
                  {showArchive && (
                    <button
                      type="button"
                      onClick={() => { onArchive(ticket.id); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5 text-text-muted" />
                      Archive
                    </button>
                  )}
                  {showMajorIncident && (
                    <button
                      type="button"
                      onClick={() => { onDeclareMajorIncident(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5 text-error" />
                      Declare Major Incident
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-text-muted min-w-0">
          <span className="truncate">
            Owner&nbsp;<strong className="font-semibold text-text-secondary">{ownerName || '—'}</strong>
          </span>
        </div>
      </div>
    </header>
  );
}
