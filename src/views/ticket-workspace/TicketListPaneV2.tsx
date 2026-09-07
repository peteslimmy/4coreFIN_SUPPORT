import React, { useState, useMemo, useRef } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';

import { TicketPriority, TicketStatus } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import { useTicketUI } from '../../context/TicketUIContext';
import TicketCardV2 from '../../components/ticket/TicketCardV2';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

const PRIORITY_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Critical (4)', value: 'CRITICAL' },
  { label: 'High (12)', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
] as const;

interface TicketListPaneV2Props {
  onNewTicket?: () => void;
}

export default function TicketListPaneV2({ onNewTicket }: TicketListPaneV2Props) {
  const {
    tickets,
    setTickets,
    logAuditAction,
    showToast,
    transitionTicket,
    getAvailableTicketTransitions,
    getScopedTickets,
  } = useApp();

  const {
    setActiveTicketId,
    searchQuery,
    setSearchQuery,
    priorityFilter,
    setPriorityFilter,
    statusFilter,
    compactDensity,
  } = useUi();

  const { actions: uiActions, state: uiState } = useTicketUI();

  const [focusedIndex, setFocusedIndex] = useState(-1);

  const parentRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter ||
        (statusFilter === 'WAITING' && t.status.startsWith('WAITING_'));
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [tickets, searchQuery, priorityFilter, statusFilter, getScopedTickets]);

  const rowVirtualizer = useVirtualizer({
    count: filteredTickets.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => compactDensity ? 50 : 68,
    overscan: 5,
  });

  useKeyboardShortcuts([
    { key: 'j', handler: () => {
      const nextIndex = focusedIndex + 1 < filteredTickets.length ? focusedIndex + 1 : 0;
      setFocusedIndex(nextIndex);
      uiActions.setFocusedIndex(nextIndex);
    }},
    { key: 'k', handler: () => {
      const prevIndex = focusedIndex - 1 >= 0 ? focusedIndex - 1 : filteredTickets.length - 1;
      setFocusedIndex(prevIndex);
      uiActions.setFocusedIndex(prevIndex);
    }},
    { key: 'Enter', handler: () => {
      if (focusedIndex >= 0 && focusedIndex < filteredTickets.length) {
        setActiveTicketId(filteredTickets[focusedIndex].id);
      }
    }},
    { key: ' ', handler: (e) => {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filteredTickets.length) {
        uiActions.toggleTicketSelection(filteredTickets[focusedIndex].id);
      }
    }},
    { key: 'e', ctrl: true, handler: () => {
      if (focusedIndex >= 0 && focusedIndex < filteredTickets.length) {
        const ticket = filteredTickets[focusedIndex];
        const updated = tickets.map(t =>
          t.id === ticket.id
            ? { ...t, isEscalated: true, priority: TicketPriority.CRITICAL }
            : t
        );
        setTickets(updated);
        uiActions.toggleTicketSelection(ticket.id);
      }
    }},
  ], true);

  const handleBatchEscalate = () => {
    const updated = tickets.map(t => {
      if (uiState.selectedTicketIds.has(t.id)) {
        return { ...t, isEscalated: true, priority: TicketPriority.CRITICAL };
      }
      return t;
    });
    setTickets(updated);
    uiState.selectedTicketIds.forEach(id => {
      logAuditAction(id, 'BATCH_ESCALATE', 'Batch escalated.');
    });
    uiActions.clearSelection();
    showToast(`Escalated ${uiState.selectedTicketIds.size} tickets.`, 'success');
  };

  const handleBatchStatusChange = async (newStatus: TicketStatus) => {
    const toApply: string[] = [];
    const skipped: string[] = [];
    for (const id of Array.from(uiState.selectedTicketIds) as string[]) {
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
    uiActions.clearSelection();
    if (skipped.length > 0) {
      showToast(`Skipped ${skipped.length} ticket(s) not eligible for ${newStatus}.`, 'error');
    } else {
      showToast(`Changed ${toApply.length} → ${newStatus}.`, 'success');
    }
  };

  const scopedCount = getScopedTickets(tickets).length;

  return (
    <div className="flex flex-col h-full w-72 border-r border-border bg-surface-elevated shrink-0">
      <div className="flex flex-col h-full">
        {/* HEADER */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-overline text-text-muted">Tickets</span>
              <span className="text-label-caps font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {filteredTickets.length}/{scopedCount}
              </span>
            </div>
            {onNewTicket && (
              <button onClick={onNewTicket} className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-[#fff] rounded-md text-label-caps font-semibold hover:bg-primary-dark transition focus-ring shrink-0">
                <Plus className="w-3 h-3" /> New
              </button>
            )}
          </div>

          {/* SEARCH */}
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search tickets, IDs, customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search tickets"
              className="text-sm bg-surface border border-border rounded-lg outline-none transition-all duration-200 w-full pl-8 pr-3 py-1.5 focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-surface-card"
            />
          </div>
        </div>

        {/* FILTER PILLS — priority only, matching screenshot */}
        <div className="flex h-[40px] items-center gap-[6px] border-b border-[#e5e7eb] px-[8px] shrink-0">
          {PRIORITY_FILTERS.map(f => {
            const active = priorityFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setPriorityFilter(f.value)}
                className={[
                  'h-[24px] rounded-[6px] px-[8px]',
                  'text-[10px] font-medium leading-none',
                  'transition-colors duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#991b1b]/30',
                  active
                    ? 'bg-[#111827] text-white'
                    : f.value === 'CRITICAL'
                      ? 'border border-[#fecdd3] bg-[#fff5f6] text-[#dc2626]'
                      : f.value === 'HIGH'
                        ? 'border border-[#fcd34d] bg-[#fffaf0] text-[#d97706]'
                        : f.value === 'MEDIUM'
                          ? 'h-[24px] rounded-[6px] px-[5px] border border-[#dbe3ec] bg-[#f8fafc] text-[#334155]'
                          : 'border border-[#dbe3ec] bg-[#f8fafc] text-[#334155]',
                ].join(' ')}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* BATCH ACTIONS BAR */}
        <AnimatePresence>
          {uiState.selectedTicketIds.size > 0 && (
            <motion.div
              key="selection-bar"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="mx-2 mt-2 p-3 bg-primary-light border border-primary/20 rounded-lg flex items-center justify-between gap-2 flex-wrap shrink-0"
            >
              <span className="text-label-caps font-semibold text-text-primary shrink-0">{uiState.selectedTicketIds.size} selected</span>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <button onClick={handleBatchEscalate} className="text-label-caps font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-surface-hover transition-colors shrink-0">Escalate</button>
                <select
                  onChange={async (e) => {
                    const newStatus = e.target.value as TicketStatus;
                    if (!newStatus) return;
                    await handleBatchStatusChange(newStatus);
                    e.target.value = '';
                  }}
                  value=""
                  className="text-label-caps font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md bg-transparent outline-none transition-colors cursor-pointer min-w-0"
                >
                  <option value="" disabled>Status</option>
                  <option value={TicketStatus.ASSIGNED}>Move to Assigned</option>
                  <option value={TicketStatus.INVESTIGATE}>Move to Investigate</option>
                  <option value={TicketStatus.RESOLVED}>Resolve</option>
                  <option value={TicketStatus.CLOSED}>Close</option>
                </select>
                <button onClick={uiActions.clearSelection} aria-label="Clear selection" className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TICKET LIST (virtualized) */}
        <div className="flex-1 min-h-0 overflow-hidden relative" ref={parentRef}>
          <div
            ref={listRef}
            className="h-full overflow-y-auto"
            style={{ height: '100%', width: '100%', position: 'relative' }}
          >
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={filteredTickets[virtualRow.index]?.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    height: `${virtualRow.size}px`,
                  }}
                >
                  <TicketCardV2
                    ticket={filteredTickets[virtualRow.index]}
                    isActive={uiState.activeTicketId === filteredTickets[virtualRow.index].id}
                    isSelected={uiState.selectedTicketIds.has(filteredTickets[virtualRow.index].id)}
                    isFocused={focusedIndex === virtualRow.index}
                    onSelect={setActiveTicketId}
                    onToggleSelect={uiActions.toggleTicketSelection}
                    onFocus={() => { setFocusedIndex(virtualRow.index); uiActions.setFocusedIndex(virtualRow.index); }}
                    density={compactDensity ? 'compact' : 'comfortable'}
                  />
                </div>
              ))}
            </div>
          </div>

          {filteredTickets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="text-center py-xl px-md">
                <Search className="w-6 h-6 text-text-muted mx-auto mb-2 opacity-50" />
                <p className="text-label-caps font-semibold text-text-muted">No tickets match your filters</p>
                <p className="text-label-caps text-text-muted mt-0.5">Try adjusting search or filter criteria</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
