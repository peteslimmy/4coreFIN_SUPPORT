import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, X, Check, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import StatusBadge from '../../components/ui/StatusBadge';
import { TicketPriority, TicketStatus, TicketRecord } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import { TICKET_STATUS_ORDER, TICKET_STATUS_LABELS, formatSlaCountdown } from '../../lib/utils';
import { SLA_AT_RISK_PCT, SLA_LIST_REFRESH_MS, FALLBACK_SLA_DURATION_MS } from '../../lib/constants';
import { syncTicketUpdate } from '../../lib/sync';
interface TicketListPaneProps {
  activeTicketId: string;
  showMobileTicketList: boolean;
  setShowMobileTicketList: (v: boolean) => void;
  onNewTicket: () => void;
}


export default function TicketListPane({ activeTicketId, showMobileTicketList, setShowMobileTicketList, onNewTicket }: TicketListPaneProps) {
  const {
    tickets, setTickets, saveToStorage, logAuditAction, showToast,
    transitionTicket, getAvailableTicketTransitions, getScopedTickets,
    currentUser,
  } = useApp();

const getSubmitterName = (ticket: TicketRecord): string => {
      // Handle empty string as well as undefined/null
      if (ticket.submittedByName && ticket.submittedByName.trim() !== '') {
          return ticket.submittedByName;
      }
      if (ticket.submittedBy === 'BU_SUPPORT') return 'BU Support';
      if (ticket.submittedBy === 'CUSTOMER') return 'Customer';
      return '-';
    };

    const getPriorityDisplay = (priority: TicketPriority): { label: string; className: string } => {
      const priorityMap: Record<TicketPriority, { label: string; className: string }> = {
        CRITICAL: { label: 'P1', className: 'bg-error text-error-dark' },
        HIGH: { label: 'P2', className: 'bg-warning text-warning-dark' },
        MEDIUM: { label: 'P3', className: 'bg-info text-info-dark' },
        LOW: { label: 'P4', className: 'bg-success text-success-dark' },
      };
      return priorityMap[priority] || priorityMap.LOW;
    };

    const getSLAIndicator = (slaBreached: boolean, slaAtRisk: boolean): { 
      className: string; 
      label: string; 
      title: string 
    } => {
      if (slaBreached) return { 
        className: 'bg-error text-error', 
        label: '?-?', 
        title: 'SLA breached' 
      };
      if (slaAtRisk) return { 
        className: 'bg-warning text-warning', 
        label: '?-?', 
        title: 'SLA at risk' 
      };
      return { 
        className: 'bg-success text-success', 
        label: '?-?', 
        title: 'On track' 
      };
    };

    const getAgeDisplay = (createdAt: string | undefined): string => {
      if (!createdAt) return '-';
      
      const created = new Date(createdAt).getTime();
      const nowMs = Date.now();
      const diffMs = nowMs - created;
      
      const minutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `${days}d`;
      if (hours > 0) return `${hours}h`;
      if (minutes > 0) return `${minutes}m`;
      return 'just now';
    };
    const {
    setActiveTicketId,
    searchQuery, setSearchQuery,
    priorityFilter,
    statusFilter, setStatusFilter,
  } = useUi();

  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [myWatchlistFilter, setMyWatchlistFilter] = useState(false);
  const [slaTagFilter, setSlaTagFilter] = useState<'ALL' | 'Breached' | 'At Risk' | 'On Track'>('ALL');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), SLA_LIST_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const filteredTickets = useMemo(() => {
    const slaTagOf = (deadline: string, createdAt?: string): 'Breached' | 'At Risk' | 'On Track' => {
      const deadlineMs = new Date(deadline).getTime();
      const total = createdAt ? Math.max(1, deadlineMs - new Date(createdAt).getTime()) : FALLBACK_SLA_DURATION_MS;
      const start = deadlineMs - total;
      const elapsed = now - start;
      const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
      const remaining = deadlineMs - now;
      if (remaining <= 0) return 'Breached';
      if (pct > SLA_AT_RISK_PCT) return 'At Risk';
      return 'On Track';
    };
    return getScopedTickets(tickets).filter(t => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
                            t.id.toLowerCase().includes(q) ||
                            t.customerName.toLowerCase().includes(q) ||
                            t.customerEmail.toLowerCase().includes(q) ||
                            t.category.toLowerCase().includes(q) ||
                            t.partner.toLowerCase().includes(q) ||
                            t.description.toLowerCase().includes(q);
      const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchesWatchlist = !myWatchlistFilter || (t.watchers || []).some(w => w.toLowerCase() === currentUser.email.toLowerCase());
      const ticketTag = slaTagOf(t.slaDeadline, t.createdAt);
      const matchesSlaTag = slaTagFilter === 'ALL' || ticketTag === slaTagFilter;
      return matchesSearch && matchesPriority && matchesStatus && matchesWatchlist && matchesSlaTag;
    });
  }, [tickets, searchQuery, priorityFilter, statusFilter, getScopedTickets, myWatchlistFilter, slaTagFilter, currentUser.email, now]);

  const toggleSelected = (id: string) => {
    setSelectedTicketIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  function PriorityChips() {
     const { priorityFilter, setPriorityFilter } = useUi();
     const priorities = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
     return (
       <>
         {priorities.map(p => {
           const { label, className } = getPriorityDisplay(p as TicketPriority);
           const baseClass = 'px-2 py-1 rounded-md text-[10px] font-semibold border transition-all duration-150 focus-ring';
           return (
             <button
               key={p}
               type="button"
               onClick={() => setPriorityFilter(p)}
               className={`${baseClass} ${priorityFilter === p ? className : 'bg-transparent text-text-muted border-transparent hover:text-text-primary hover:bg-surface-hover'}`}
               aria-pressed={priorityFilter === p}
             >
               {label}
             </button>
           );
         })}
       </>
     );
   }

  return (
    <div className={`${showMobileTicketList ? 'fixed inset-0 z-30 flex' : 'hidden'} lg:flex w-80 border-r border-border bg-surface-elevated flex-col shrink-0`}>
      {showMobileTicketList && (
        <div className="fixed inset-0 bg-overlay z-30 lg:hidden" onClick={() => setShowMobileTicketList(false)} role="presentation" aria-hidden="true" />
      )}
      <div className={`${showMobileTicketList ? 'relative z-40' : ''} flex flex-col h-full w-80 bg-surface-elevated`}>

        {/* ?"??"? HEADER: title + count + New ?"??"? */}
        <div className="p-3 pb-2.5 shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-overline text-text-muted">Tickets</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {filteredTickets.length}/{getScopedTickets(tickets).length}
              </span>
            </div>
            {onNewTicket && (
              <button onClick={onNewTicket} className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-md text-caption font-semibold hover:bg-primary-dark transition focus-ring shrink-0">
                <Plus className="w-3 h-3" /> New
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Search tickets, IDs, customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search tickets" className="text-body-sm bg-surface border border-border rounded-lg outline-none transition-all duration-200 w-full pl-8 pr-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-surface-card" />
          </div>
        </div>

        {/* ?"??"? FILTERS ?"??"? */}
        <div className="px-3 pb-2.5 border-b border-border space-y-2 shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <PriorityChips />
            <button
              type="button"
              onClick={() => { setMyWatchlistFilter(!myWatchlistFilter); setSlaTagFilter('ALL'); }}
              aria-pressed={myWatchlistFilter}
              className={`ml-auto px-2 py-1 rounded-md text-[10px] font-semibold border transition-all duration-150 focus-ring ${
                myWatchlistFilter
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-transparent text-text-muted border-transparent hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              Watch
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-1.5 text-[11px] text-text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 cursor-pointer">
              <option value="ALL">All Status</option>
              {TICKET_STATUS_ORDER.map(s => <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>)}
            </select>
            <select value={slaTagFilter} onChange={(e) => { setSlaTagFilter(e.target.value as typeof slaTagFilter); setMyWatchlistFilter(false); }} aria-label="Filter by SLA tag" className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-1.5 text-[11px] text-text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 cursor-pointer">
              <option value="ALL">SLA: All</option>
              <option value="Breached">SLA: Breached</option>
              <option value="At Risk">SLA: At Risk</option>
              <option value="On Track">SLA: On Track</option>
            </select>
          </div>
        </div>

        {/* ?"??"? SELECTION ACTION BAR (anchored above list) ?"??"? */}
        <AnimatePresence>
          {selectedTicketIds.size > 0 && (
            <motion.div
              key="selection-bar"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="mx-3 mt-2.5 p-2 bg-primary-light border border-primary/20 rounded-lg flex items-center justify-between gap-2 shrink-0"
            >
              <span className="text-caption font-semibold text-text-primary shrink-0">{selectedTicketIds.size} selected</span>
              <div className="flex items-center gap-1 min-w-0">
                <button onClick={() => {
                  const updated = tickets.map(t => { if (selectedTicketIds.has(t.id)) { return { ...t, isEscalated: true, priority: TicketPriority.CRITICAL } } return t; });
                  setTickets(updated);
                  selectedTicketIds.forEach(id => { logAuditAction(id, 'BATCH_ESCALATE', 'Batch escalated.'); syncTicketUpdate(id, { isEscalated: true, priority: TicketPriority.CRITICAL }); });
                  setSelectedTicketIds(new Set()); saveToStorage(updated);
                  showToast(`Escalated ${selectedTicketIds.size} tickets.`, 'success');
                }} className="text-[10px] font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-surface-hover transition-colors shrink-0">Escalate</button>
                <select onChange={async (e) => {
                  const newStatus = e.target.value as TicketStatus; if (!newStatus) return;
                  const toApply: string[] = [];
                  const skipped: string[] = [];
                  for (const id of Array.from(selectedTicketIds) as string[]) {
                    const t = tickets.find(x => x.id === id);
                    if (!t) { skipped.push(id); continue; }
                    if (getAvailableTicketTransitions(t).some(r => r.to === newStatus)) toApply.push(id);
                    else skipped.push(id);
                  }
                  const promises = toApply.map(id => {
                    const t = tickets.find(x => x.id === id);
                    return t ? transitionTicket(id, newStatus).catch(() => undefined) : Promise.resolve();
                  });
                  await Promise.all(promises);
                  setSelectedTicketIds(new Set());
                  if (skipped.length > 0) {
                    showToast(`Skipped ${skipped.length} ticket(s) not eligible for ${newStatus}.`, 'error');
                  } else {
                    showToast(`Changed ${toApply.length} -> ${newStatus}.`, 'success');
                  }
                }} defaultValue="" className="text-[10px] font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md bg-transparent outline-none transition-colors cursor-pointer min-w-0">
                  <option value="" disabled>Status</option>
                  <option value={TicketStatus.ASSIGNED}>Move to Assigned</option>
                  <option value={TicketStatus.INVESTIGATE}>Move to Investigate</option>
                  <option value={TicketStatus.RESOLVED}>Resolve</option>
                  <option value={TicketStatus.CLOSED}>Close</option>
                </select>
                <button onClick={() => setSelectedTicketIds(new Set())} aria-label="Clear selection" className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ?"??"? TICKET LIST ?"??"? */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredTickets.map(t => {
              const deadlineMs = new Date(t.slaDeadline).getTime();
              const total = t.createdAt ? Math.max(1, deadlineMs - new Date(t.createdAt).getTime()) : FALLBACK_SLA_DURATION_MS;
              const start = deadlineMs - total;
              const elapsed = now - start;
               const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
               const slaBreached = deadlineMs - now <= 0;
               const slaAtRisk = !slaBreached && pct > SLA_AT_RISK_PCT;
               const isSelected = selectedTicketIds.has(t.id);
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={`group relative bg-surface-card rounded-lg shadow-card transition-all duration-200 overflow-hidden ${
                    activeTicketId === t.id
                      ? 'bg-primary/5 shadow-card-hover'
                      : isSelected
                        ? 'bg-primary/5 ring-1 ring-accent/30'
                        : 'hover:shadow-card-hover hover:bg-surface-hover'
                  }`}
                >
<button
                      onClick={() => setActiveTicketId(t.id)}
                      title={`${getSubmitterName(t)} ?? ${t.category} ?? ${t.submittedBy === 'BU_SUPPORT' ? 'BU Support' : 'Customer'} ?? ${getAgeDisplay(t.createdAt)}`}
                      className="w-full text-left p-4"
                    >
                     {/* Row 1: Priority + Ticket ID + Status */}
<div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                            <span className={`${getPriorityDisplay(t.priority).className} w-3 h-3 rounded-full mr-1`} />
                            <span className="font-numeric text-text-secondary font-medium">{getPriorityDisplay(t.priority).label}</span>
                          </div>
                        <div className="flex-1 text-center">
                          <span className="font-mono text-text-primary">{t.id}</span>
                        </div>
                        <StatusBadge status={t.status} size="sm" className="ml-4" />
                      </div>

{/* Row 2: Category + SLA */}
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-caption text-text-muted w-full truncate">{t.category}</span>
                        <span className="flex items-center">
                            <span className={`${getSLAIndicator(slaBreached, slaAtRisk).className} w-3 h-3 rounded-full mr-1`} />
                            <span className="text-caption font-medium">{getSLAIndicator(slaBreached, slaAtRisk).label}</span>
                         </span>
                     </div>

                     {/* Row 3: Submitter + Age */}
                     <div className="flex items-center justify-between">
                       <p className="text-body-sm font-semibold text-text-primary truncate">{getSubmitterName(t)}</p>
                       <span className="text-caption text-text-muted">{getAgeDisplay(t.createdAt)}</span>
                     </div>
                   </button>

                  {/* Selection checkbox (top-right, revealed on hover; always visible when selected) */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSelected(t.id); }}
                    aria-label={isSelected ? `Deselect ticket ${t.id}` : `Select ticket ${t.id}`}
                    aria-pressed={isSelected}
                    className={`absolute top-2 right-2 w-[18px] h-[18px] p-0.5 rounded border transition-all duration-150 focus-ring ${
                      isSelected
                        ? 'bg-primary border-primary text-white opacity-100'
                        : 'bg-surface-card border-border text-transparent opacity-0 group-hover:opacity-100 hover:border-accent'
                    }`}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Empty state */}
          {filteredTickets.length === 0 && (
            <div className="text-center py-10 px-4">
              <Search className="w-6 h-6 text-text-muted mx-auto mb-2 opacity-50" />
              <p className="text-caption font-semibold text-text-muted">No tickets match your filters</p>
              <p className="text-[10px] text-text-muted mt-0.5">Try adjusting search or filter criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

