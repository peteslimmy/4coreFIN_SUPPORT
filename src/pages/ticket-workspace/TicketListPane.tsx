import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import StatusBadge from '../../components/ui/StatusBadge';
import { TicketPriority, TicketStatus } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { TICKET_STATUS_ORDER, TICKET_STATUS_LABELS, formatSlaDuration } from '../../lib/utils';
import { syncTicketPatch } from '../../lib/sync';

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
    searchQuery, setSearchQuery, statusFilter, setStatusFilter, priorityFilter,
    currentUser, setActiveTicketId,
  } = useApp();

  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [myWatchlistFilter, setMyWatchlistFilter] = useState(false);
  const [slaTagFilter, setSlaTagFilter] = useState<'ALL' | 'Breached' | 'At Risk' | 'On Track'>('ALL');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const filteredTickets = useMemo(() => {
    const slaTagOf = (deadline: string, createdAt?: string): 'Breached' | 'At Risk' | 'On Track' => {
      const deadlineMs = new Date(deadline).getTime();
      const total = createdAt ? Math.max(1, deadlineMs - new Date(createdAt).getTime()) : 24 * 3600000;
      const start = deadlineMs - total;
      const elapsed = now - start;
      const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
      const remaining = deadlineMs - now;
      if (remaining <= 0) return 'Breached';
      if (pct > 75) return 'At Risk';
      return 'On Track';
    };
    return getScopedTickets(tickets).filter(t => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
                            t.id.toLowerCase().includes(q) ||
                            t.customerName.toLowerCase().includes(q) ||
                            t.customerEmail.toLowerCase().includes(q) ||
                            t.category.toLowerCase().includes(q) ||
                            t.provider.toLowerCase().includes(q) ||
                            t.description.toLowerCase().includes(q);
      const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchesWatchlist = !myWatchlistFilter || (t.watchers || []).some(w => w.toLowerCase() === currentUser.email.toLowerCase());
      const ticketTag = slaTagOf(t.slaDeadline, t.createdAt);
      const matchesSlaTag = slaTagFilter === 'ALL' || ticketTag === slaTagFilter;
      return matchesSearch && matchesPriority && matchesStatus && matchesWatchlist && matchesSlaTag;
    });
  }, [tickets, searchQuery, priorityFilter, statusFilter, getScopedTickets, myWatchlistFilter, slaTagFilter, currentUser.email, now]);

  return (
    <div className={`${showMobileTicketList ? 'fixed inset-0 z-30 flex' : 'hidden'} lg:flex w-80 border-r border-border bg-surface-elevated flex-col shrink-0`}>
      {showMobileTicketList && (
        <div className="fixed inset-0 bg-overlay z-30 lg:hidden" onClick={() => setShowMobileTicketList(false)} role="presentation" aria-hidden="true" />
      )}
      <div className={`${showMobileTicketList ? 'relative z-40' : ''} flex flex-col h-full w-80 bg-surface-elevated`}>
        <div className="p-3 border-b border-border space-y-2 shrink-0">
          <div className="flex items-center justify-between lg:hidden">
            <span className="text-xs font-bold text-text-primary">Tickets</span>
            <button onClick={() => setShowMobileTicketList(false)} className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors focus-ring" aria-label="Close ticket list">&times;</button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Search tickets, IDs, customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search tickets" className="text-xs bg-surface border border-border rounded-lg outline-none transition-all duration-200 w-full pl-8 pr-3 py-2 focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all focus:bg-surface-elevated" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-1.5 text-[10px] text-text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring">
              <option value="ALL">All Status</option>
              {TICKET_STATUS_ORDER.map(s => <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>)}
            </select>
            <button onClick={() => { setMyWatchlistFilter(!myWatchlistFilter); setSlaTagFilter('ALL'); }} className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition focus-ring ${myWatchlistFilter ? 'bg-surface text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}`}>Watch</button>
            <select value={slaTagFilter} onChange={(e) => { setSlaTagFilter(e.target.value as typeof slaTagFilter); setMyWatchlistFilter(false); }} aria-label="Filter by SLA tag" className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2 py-1.5 text-[10px] text-text-primary focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring cursor-pointer">
              <option value="ALL">SLA: All</option>
              <option value="Breached">SLA: Breached</option>
              <option value="At Risk">SLA: At Risk</option>
              <option value="On Track">SLA: On Track</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">
              <strong className="text-text-primary">{filteredTickets.length}</strong> / {getScopedTickets(tickets).length}
            </span>
            <button onClick={onNewTicket} className="flex items-center gap-1 px-2 py-1 bg-primary text-white rounded-md text-[10px] font-semibold hover:bg-primary-dark transition focus-ring shrink-0">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          {selectedTicketIds.size > 0 && (
            <div className="bg-surface rounded-lg p-2 flex items-center justify-between">
              <span className="text-[10px] text-text-muted font-medium">{selectedTicketIds.size} selected</span>
              <div className="flex gap-1">
                <button onClick={() => {
                  const updated = tickets.map(t => { if (selectedTicketIds.has(t.id)) { return { ...t, isEscalated: true, priority: TicketPriority.CRITICAL } } return t; });
                  setTickets(updated);
                  selectedTicketIds.forEach(id => { logAuditAction(id, 'BATCH_ESCALATE', 'Batch escalated.'); syncTicketPatch(id, { isEscalated: true, priority: TicketPriority.CRITICAL }); });
                  setSelectedTicketIds(new Set()); saveToStorage(updated);
                  showToast(`Escalated ${selectedTicketIds.size} tickets.`, 'success');
                }} className="text-[10px] font-medium text-text-muted hover:text-text-primary px-2 py-1 rounded-md hover:bg-surface-card">Escalate</button>
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
                }} defaultValue="" className="text-[10px] font-medium text-text-muted hover:text-text-primary px-2 py-1 rounded-md bg-surface-elevated outline-none transition-all duration-200 focus-ring cursor-pointer">
                  <option value="" disabled>Status</option>
                  <option value={TicketStatus.ASSIGNED}>Move to Assigned</option>
                  <option value={TicketStatus.INVESTIGATE}>Move to Investigate</option>
                  <option value={TicketStatus.RESOLVED}>Resolve</option>
                  <option value={TicketStatus.CLOSED}>Close</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          <AnimatePresence mode="popLayout">
            {filteredTickets.map(t => {
              const deadlineMs = new Date(t.slaDeadline).getTime();
              const total = t.createdAt ? Math.max(1, deadlineMs - new Date(t.createdAt).getTime()) : 24 * 3600000;
              const start = deadlineMs - total;
              const elapsed = now - start;
              const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
              const slaBreached = deadlineMs - now <= 0;
              const slaAtRisk = !slaBreached && pct > 75;
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={`bg-surface-card rounded-lg shadow-card border transition-all duration-200 cursor-pointer overflow-hidden ${
                    activeTicketId === t.id
                      ? 'border-accent shadow-card-hover'
                      : 'border-border hover:shadow-card-hover hover:border-accent/30'
                  }`}
                >
                  <button onClick={() => setActiveTicketId(t.id)} title={`${t.customerName} · ${t.category} · ${t.assignedAgentId || 'Unassigned'}`} className="w-full text-left p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-numeric text-[10px] font-bold text-accent">{t.id}</span>
                        <StatusBadge status={t.status} size="sm" />
                      </div>
                      {slaBreached ? (
                        <span className="bg-error/10 text-error font-bold text-[9px] px-1.5 py-0.5 rounded-full border border-error/20 uppercase tracking-wider shrink-0">Breached -{formatSlaDuration(new Date(t.slaDeadline).getTime(), now)}</span>
                      ) : slaAtRisk ? (
                        <span className="bg-warning/10 text-warning font-bold text-[9px] px-1.5 py-0.5 rounded-full border border-warning/20 uppercase tracking-wider shrink-0">At Risk</span>
                      ) : (
                        <span className="bg-success/10 text-success font-bold text-[9px] px-1.5 py-0.5 rounded-full border border-success/20 uppercase tracking-wider shrink-0">On Track</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-body-sm font-semibold text-text-primary truncate">{t.customerName}</p>
                      <p className="text-caption text-text-muted truncate shrink-0 max-w-[45%]">{t.category}</p>
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
