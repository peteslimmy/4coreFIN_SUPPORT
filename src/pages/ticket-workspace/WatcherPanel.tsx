import React from 'react';
import { Bell } from 'lucide-react';

import type { TicketRecord } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { isValidEmail } from '../../lib/constants';
import { syncNotification, syncNotificationRead, syncTicketUpdate } from '../../lib/sync';

interface WatcherPanelProps {
  activeTicket: TicketRecord;
  selectedWatcherIds: Set<string>;
  setSelectedWatcherIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  newWatcherEmail: string;
  setNewWatcherEmail: (v: string) => void;
  setNotifyWatcherModal: (v: { isOpen: boolean; watcherEmail: string | null }) => void;
  setRemoveWatcherConfirm: (v: string | null) => void;
}

export default function WatcherPanel({ activeTicket, selectedWatcherIds, setSelectedWatcherIds, newWatcherEmail, setNewWatcherEmail, setNotifyWatcherModal, setRemoveWatcherConfirm }: WatcherPanelProps) {
  const {
    tickets, setTickets, watcherNotifications, setWatcherNotifications,
    comments, auditLogs, majorIncidents, users, slaRules, holidays, ticketTemplates, kbArticles,
    saveToStorage, showToast, currentUser, logAuditAction,
  } = useApp();

  return (
    <div id="watchers-matrix-card" className="bg-surface-elevated rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Watchers & Notifications</h3>
        <div className="flex items-center gap-2">
          {selectedWatcherIds.size > 0 && <button onClick={() => setNotifyWatcherModal({ isOpen: true, watcherEmail: 'BULK' })} className="text-xs px-3 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition focus-ring">Notify ({selectedWatcherIds.size})</button>}
        </div>
      </div>
      <p className="text-xs text-text-muted mb-4 leading-relaxed">Add team members to receive real-time updates on state changes, escalations, and responses.</p>
      <div className="space-y-2 mb-4">
        {!(activeTicket.watchers && activeTicket.watchers.length > 0) ? (
          <div className="p-6 bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-center">
            <Bell className="w-8 h-8 text-text-muted mb-2" />
            <h4 className="text-body-sm font-semibold text-text-primary">No Watchers</h4>
            <p className="text-xs text-text-muted mt-1 mb-3">Add team members to receive real-time updates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {activeTicket.watchers.map((watcher) => (
              <div key={watcher} className="flex justify-between items-center bg-surface border border-border rounded-lg px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2 overflow-hidden min-w-0">
                  <input type="checkbox" checked={selectedWatcherIds.has(watcher)} onChange={(e) => { const s = new Set(selectedWatcherIds); if (e.target.checked) s.add(watcher); else s.delete(watcher); setSelectedWatcherIds(s); }} className="rounded border-border text-primary focus:ring-brand-500" />
                  <span className="truncate text-text-primary font-medium">{watcher}</span>
                  {watcherNotifications.some(n => n.recipient === watcher && n.message.includes('[URGENT DIRECT]') && !n.seen) && (
                    <button onClick={() => { const u = watcherNotifications.map(n => n.recipient === watcher && n.message.includes('[URGENT DIRECT]') ? { ...n, seen: true } : n); setWatcherNotifications(u); const changed = u.find(n => n.recipient === watcher && n.message.includes('[URGENT DIRECT]')); if (changed) syncNotificationRead(changed.id); saveToStorage(tickets, comments, auditLogs, majorIncidents, u, users, slaRules, holidays, ticketTemplates, kbArticles); }} className="ml-1 text-[10px] bg-error-light text-error font-semibold px-1.5 py-0.5 rounded">Urgent</button>
                  )}
                </div>
                <div className="flex items-center shrink-0">
                  <button onClick={() => setNotifyWatcherModal({ isOpen: true, watcherEmail: watcher })} className="text-xs text-primary hover:text-primary-dark font-semibold px-2 py-0.5">Notify</button>
                  <button id={`remove-watcher-${watcher}`} onClick={() => setRemoveWatcherConfirm(watcher)} aria-label={`Remove watcher ${watcher}`} className="text-text-muted hover:text-error text-xs font-bold px-1 ml-1 focus-ring">&times;</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input id="add-watcher-input" type="email" placeholder="colleague@company.com" value={newWatcherEmail} onChange={(e) => setNewWatcherEmail(e.target.value)} className="flex-1 bg-surface border border-border rounded-lg px-3 py-2.5 text-xs focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring text-text-primary placeholder:text-text-muted" />
        <button id="add-watcher-btn" onClick={() => {
          const emailInput = newWatcherEmail.trim(); if (!emailInput) { showToast('Please enter a valid email.', 'error'); return; }
          const emails = emailInput.split(',').map(e => e.trim()).filter(e => e.length > 0);
          const validEmails: string[] = [];
          for (const email of emails) {
            if (!isValidEmail(email)) { showToast(`Invalid: ${email}`, 'error'); continue; }
            if ((activeTicket.watchers || []).map(w => w.toLowerCase()).includes(email.toLowerCase())) { showToast(`${email} already watching.`, 'info'); continue; }
            validEmails.push(email);
          }
          if (validEmails.length === 0) return;
          const updated = tickets.map(t => { if (t.id === activeTicket.id) { return { ...t, watchers: [...(t.watchers || []), ...validEmails] } } return t; });
          const newNotifications = validEmails.map(email => ({ id: 'wn-' + Date.now() + '-' + Math.random(), timestamp: new Date().toISOString(), ticketId: activeTicket.id, message: `Added as watcher to ticket ${activeTicket.id} by ${currentUser.firstName + ' ' + currentUser.lastName}.`, recipient: email, seen: false }));
          const updatedWN = [...newNotifications, ...watcherNotifications];
          setTickets(updated); setWatcherNotifications(updatedWN); setNewWatcherEmail('');
          saveToStorage(updated, comments, auditLogs, majorIncidents, updatedWN, users, slaRules, holidays, ticketTemplates, kbArticles);
          const changedTicket = updated.find(t => t.id === activeTicket.id);
          if (changedTicket) syncTicketUpdate(changedTicket.id, { watchers: changedTicket.watchers || [] });
          newNotifications.forEach(n => syncNotification(n));
          showToast(`Added ${validEmails.length} watcher(s).`, 'success');
          logAuditAction(activeTicket.id, 'TICKET_WATCHER_ADDED', `Added ${validEmails.join(', ')} to watchers.`);
        }} className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-lg transition focus-ring shrink-0">Add</button>
      </div>
    </div>
  );
}
