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

  return (
    <header className="glass-surface sticky top-0 z-10 shrink-0 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-overline text-text-muted">Ticket ID</span>
          <span className="font-numeric font-bold text-[11px] text-text-primary tracking-tight">{ticket.id}</span>
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} size="xs" />
          {ticket.isEscalated && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-error/10 text-error dark:bg-error/20 rounded-full text-[11px] font-semibold uppercase tracking-wider">
              Escalated
            </span>
          )}
          {ticket.duplicateOf && (
            <span className="px-2 py-0.5 bg-accent/10 text-accent-dark dark:bg-accent/20 rounded-full text-[11px] font-semibold uppercase tracking-wider" title={`Duplicate of ${ticket.duplicateOf}`}>
              Dup of {ticket.duplicateOf}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted min-w-0 flex-1">
          <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
          <span className="truncate">
            Owner: <strong className="font-semibold text-text-primary">{ownerName}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
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

        <div className="flex items-center gap-2">
          <div className="h-6 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            {sla.deadline && (
              <>
                <span className={`font-mono text-xs font-medium ${sla.breached ? 'text-error' : sla.atRisk ? 'text-warning' : 'text-text-primary'}`}>
                  {sla.formattedShort}
                </span>
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${sla.source === 'rule' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-warning/10 text-warning border-warning/20'}`} title={sla.source === 'rule' ? 'Deadline set by a configured SLA category rule' : 'No category rule matched; using the priority fallback SLA'}>
                  {sla.source === 'rule' ? 'Rule' : 'Default'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
