import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { TicketPriority, TicketStatus } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import { TICKET_STATUS_ORDER, TICKET_STATUS_LABELS } from '../../lib/utils';
import { SLA_LIST_REFRESH_MS } from '../../lib/constants';
import { syncTicketUpdate } from '../../lib/sync';
import { TicketCard } from '../../components/ticket';

const getPriorityDisplay = (priority: TicketPriority): { label: string; className: string } => {
  const priorityMap: Record<TicketPriority, { label: string; className: string }> = {
    CRITICAL: { label: 'CRITICAL', className: 'bg-error text-error-dark' },
    HIGH: { label: 'HIGH', className: 'bg-warning text-warning-dark' },
    MEDIUM: { label: 'MEDIUM', className: 'bg-info text-info-dark' },
    LOW: { label: 'LOW', className: 'bg-success text-success-dark' },
  };
  return priorityMap[priority] || priorityMap.LOW;
};

function PriorityChips() {
  const { priorityFilter, setPriorityFilter } = useUi();
  const priorities = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
  return (
    <>
      {priorities.map(p => {
        let label: string;
        let className: string;

        if (p === 'ALL') {
          label = 'ALL';
          className = 'bg-transparent text-text-muted border-transparent';
        } else {
          const priorityDisplay = getPriorityDisplay(p as TicketPriority);
          label = priorityDisplay.label;
          className = priorityDisplay.className;
        }

        const baseClass = 'px-2 py-1 rounded-md text-label-caps font-semibold border transition-all duration-150 focus-ring';
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

  const {
    setActiveTicketId,
    searchQuery, setSearchQuery,
    priorityFilter,
    statusFilter, setStatusFilter,
    compactDensity,
  } = useUi();

  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [myWatchlistFilter, setMyWatchlistFilter] = useState(false);
  const [slaTagFilter, setSlaTagFilter] = useState<'ALL' | 'Breached' | 'At Risk' | 'On Track'>('ALL');
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), SLA_LIST_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const filteredTickets = useMemo(() => {
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
      return matchesSearch && matchesPriority && matchesStatus && matchesWatchlist;
    });
  }, [tickets, searchQuery, priorityFilter, statusFilter, getScopedTickets, myWatchlistFilter, currentUser.email]);

  const toggleSelected = (id: string) => {
    setSelectedTicketIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className={`${showMobileTicketList ? 'fixed inset-0 z-30 flex' : 'hidden'} lg:flex w-72 border-r border-border bg-surface-elevated flex-col shrink-0`}>
      {showMobileTicketList && (
        <div className="fixed inset-0 bg-overlay z-30 lg:hidden" onClick={() => setShowMobileTicketList(false)} role="presentation" aria-hidden="true" />
      )}
      <div className={`${showMobileTicketList ? 'relative z-40' : ''} flex flex-col h-full w-72 bg-surface-elevated`}>

        {/* HEADER: title + count + New */}
        <div className="p-md pb-sm shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-sm">
              <span className="text-overline text-text-muted">Tickets</span>
              <span className="text-label-caps font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {filteredTickets.length}/{getScopedTickets(tickets).length}
              </span>
            </div>
            {onNewTicket && (
              <button onClick={onNewTicket} className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-[#fff] rounded-md text-label-caps font-semibold hover:bg-primary-dark transition focus-ring shrink-0">
                <Plus className="w-3 h-3" /> New
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Search tickets, IDs, customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search tickets" className="text-sm bg-surface border border-border rounded-lg outline-none transition-all duration-200 w-full pl-8 pr-3 py-1.5 focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-surface-card" />
          </div>
        </div>

        {/* FILTERS */}
        <div className="px-2 pb-1.5 border-b border-border space-y-1.5 shrink-0">
          <div className="flex items-center gap-sm flex-wrap">
            <PriorityChips />
            <button
              type="button"
              onClick={() => { setMyWatchlistFilter(!myWatchlistFilter); setSlaTagFilter('ALL'); }}
              aria-pressed={myWatchlistFilter}
              className={`ml-auto px-2 py-1 rounded-md text-label-caps font-semibold border transition-all duration-150 focus-ring ${
                myWatchlistFilter
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-transparent text-text-muted border-transparent hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              Watch
            </button>
          </div>
          <div className="flex items-center gap-sm">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-1 text-label-caps text-text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 cursor-pointer">
              <option value="ALL">All Status</option>
              {TICKET_STATUS_ORDER.map(s => <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>)}
            </select>
            <select value={slaTagFilter} onChange={(e) => { setSlaTagFilter(e.target.value as typeof slaTagFilter); setMyWatchlistFilter(false); }} aria-label="Filter by SLA tag" className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-1 text-label-caps text-text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 cursor-pointer">
              <option value="ALL">SLA: All</option>
              <option value="Breached">SLA: Breached</option>
              <option value="At Risk">SLA: At Risk</option>
              <option value="On Track">SLA: On Track</option>
            </select>
          </div>
        </div>

        {/* SELECTION ACTION BAR */}
        <AnimatePresence>
          {selectedTicketIds.size > 0 && (
            <motion.div
              key="selection-bar"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="mx-3 mt-2.5 p-md bg-primary-light border border-primary/20 rounded-lg flex items-center justify-between gap-sm shrink-0"
            >
              <span className="text-label-caps font-semibold text-text-primary shrink-0">{selectedTicketIds.size} selected</span>
              <div className="flex items-center gap-sm min-w-0">
                <button onClick={() => {
                  const updated = tickets.map(t => { if (selectedTicketIds.has(t.id)) { return { ...t, isEscalated: true, priority: TicketPriority.CRITICAL } } return t; });
                  setTickets(updated);
                  selectedTicketIds.forEach(id => { logAuditAction(id, 'BATCH_ESCALATE', 'Batch escalated.'); syncTicketUpdate(id, { isEscalated: true, priority: TicketPriority.CRITICAL }); });
                  setSelectedTicketIds(new Set()); saveToStorage(updated);
                  showToast(`Escalated ${selectedTicketIds.size} tickets.`, 'success');
                }} className="text-label-caps font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-surface-hover transition-colors shrink-0">Escalate</button>
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
                }} value="" className="text-label-caps font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md bg-transparent outline-none transition-colors cursor-pointer min-w-0">
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

        {/* TICKET LIST */}
        <div className="flex-1 min-h-0 overflow-y-auto p-md space-y-sm scrollbar-thin">
          <AnimatePresence mode="popLayout">
            {filteredTickets.map(t => (
              <TicketCard
                key={t.id}
                ticket={t}
                isActive={activeTicketId === t.id}
                isSelected={selectedTicketIds.has(t.id)}
                onSelect={setActiveTicketId}
                onToggleSelect={toggleSelected}
                density={compactDensity ? 'compact' : 'comfortable'}
              />
            ))}
          </AnimatePresence>

          {/* Empty state */}
          {filteredTickets.length === 0 && (
            <div className="text-center py-xl px-md">
              <Search className="w-6 h-6 text-text-muted mx-auto mb-2 opacity-50" />
              <p className="text-label-caps font-semibold text-text-muted">No tickets match your filters</p>
              <p className="text-label-caps text-text-muted mt-0.5">Try adjusting search or filter criteria</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
