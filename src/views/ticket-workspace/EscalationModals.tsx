import React from 'react';

import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Textarea from '../../components/ui/Textarea';
import type { TicketRecord } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { syncNotification, syncTicketUpdate } from '../../lib/sync';

interface EscalationModalsProps {
  activeTicket: TicketRecord | null;
  showEscalationModal: boolean;
  setShowEscalationModal: (v: boolean) => void;
  escalationReason: string;
  setEscalationReason: (v: string) => void;
  formErrors: Record<string, string>;
  clearError: (field: string) => void;
  clearFormErrors: () => void;
  confirmEscalation: () => void;
  archiveConfirmId: string | null;
  setArchiveConfirmId: (v: string | null) => void;
  removeWatcherConfirm: string | null;
  setRemoveWatcherConfirm: (v: string | null) => void;
  notifyWatcherModal: { isOpen: boolean; watcherEmail: string | null };
  setNotifyWatcherModal: (v: { isOpen: boolean; watcherEmail: string | null }) => void;
  directMessageText: string;
  setDirectMessageText: (v: string) => void;
  selectedWatcherIds: Set<string>;
  setSelectedWatcherIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function EscalationModals(props: EscalationModalsProps) {
  const {
    activeTicket, showEscalationModal, setShowEscalationModal,
    escalationReason, setEscalationReason, formErrors, clearError, clearFormErrors, confirmEscalation,
    archiveConfirmId, setArchiveConfirmId,
    removeWatcherConfirm, setRemoveWatcherConfirm,
    notifyWatcherModal, setNotifyWatcherModal,
    directMessageText, setDirectMessageText,
    selectedWatcherIds, setSelectedWatcherIds,
  } = props;

  const {
    setTickets, watcherNotifications, setWatcherNotifications,
    comments, auditLogs, majorIncidents, users, slaRules, holidays, ticketTemplates, kbArticles,
    showToast, currentUser, logAuditAction, tickets,
  } = useApp();

  if (!activeTicket) return null;

  return (
    <>
      {showEscalationModal && (
        <Modal open={showEscalationModal} onClose={() => { setShowEscalationModal(false); setEscalationReason(''); }} title="Manual Escalation" size="sm">
          <p className="text-body-sm text-text-secondary mb-4">Provide a mandatory reason for escalating this ticket to CRITICAL priority. This will be recorded in the compliance audit trail.</p>
          <Textarea
            value={escalationReason}
            onChange={(e) => { setEscalationReason(e.target.value); clearError('escalationReason'); }}
            placeholder="e.g. Customer has been waiting 6+ hours with no response from partner..."
            rows={4}
            error={formErrors.escalationReason}
          />
          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={() => { setShowEscalationModal(false); setEscalationReason(''); clearFormErrors(); }}
              className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-all duration-200 focus-ring"
            >
              Cancel
            </button>
            <button
              onClick={confirmEscalation}
              className="px-4 py-2 text-sm font-bold text-white rounded-xl transition-all duration-200 bg-warning hover:bg-warning-dark active:bg-warning-dark focus-ring"
            >
              Confirm Escalation
            </button>
          </div>
        </Modal>
      )}

      {notifyWatcherModal.isOpen && (
        <Modal
          open={notifyWatcherModal.isOpen}
          onClose={() => { setNotifyWatcherModal({ isOpen: false, watcherEmail: null }); setDirectMessageText(''); }}
          title={notifyWatcherModal.watcherEmail === 'BULK' ? 'Bulk Notification' : `Notify ${notifyWatcherModal.watcherEmail}`}
          size="sm"
          footer={
            <div className="flex gap-2 justify-end w-full">
              <button
                onClick={() => { setNotifyWatcherModal({ isOpen: false, watcherEmail: null }); setDirectMessageText(''); }}
                className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-all duration-200 focus-ring"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const recipients = notifyWatcherModal.watcherEmail === 'BULK'
                    ? Array.from(selectedWatcherIds)
                    : [notifyWatcherModal.watcherEmail || ''];
                  const newNotifications = recipients.map(recipient => ({
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    ticketId: activeTicket.id,
                    message: `[URGENT DIRECT] ${directMessageText}`,
                    recipient: recipient,
                    seen: false
                  }));
                  const updatedWN = [...newNotifications, ...watcherNotifications];
                  setWatcherNotifications(updatedWN);
                  newNotifications.forEach(n => syncNotification(n));
                  showToast(`Direct urgent notification sent to ${recipients.length} watcher(s).`);
                  setNotifyWatcherModal({ isOpen: false, watcherEmail: null });
                  setDirectMessageText('');
                  if (notifyWatcherModal.watcherEmail === 'BULK') {
                    setSelectedWatcherIds(new Set());
                  }
                }}
                className="px-4 py-2 text-sm font-bold text-white rounded-xl transition-all duration-200 bg-primary hover:bg-primary-dark active:bg-primary-dark focus-ring"
              >
                Send Notification
              </button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary mb-4">Send a direct, urgent, and tagged message to this watcher.</p>
          <Textarea
            value={directMessageText}
            onChange={(e) => setDirectMessageText(e.target.value)}
            placeholder="Enter urgent message..."
            rows={4}
          />
        </Modal>
      )}
      <ConfirmModal
        isOpen={archiveConfirmId !== null}
        onClose={() => setArchiveConfirmId(null)}
        onConfirm={() => {
          if (!archiveConfirmId) return;
          setTickets(prev => prev.map(t => t.id === archiveConfirmId ? { ...t, isDeleted: true } : t));
          syncTicketUpdate(archiveConfirmId, { isDeleted: true });
          logAuditAction(archiveConfirmId, 'TICKET_SOFT_DELETED', `Ticket ${archiveConfirmId} soft-deleted by ${currentUser.firstName + ' ' + currentUser.lastName} (${currentUser.email}) for compliance archival.`);
          showToast(`Ticket ${archiveConfirmId} archived (soft-delete).`, 'success');
          setArchiveConfirmId(null);
        }}
        title="Archive Ticket"
        message={`Permanently archive ticket ${archiveConfirmId}? This is a soft-delete for compliance retention.`}
        confirmLabel="Archive"
      />
      <ConfirmModal
        isOpen={removeWatcherConfirm !== null}
        onClose={() => setRemoveWatcherConfirm(null)}
        onConfirm={() => {
          const watcher = removeWatcherConfirm;
          if (!watcher) return;
          const u = tickets.map(t => {
            if (t.id === activeTicket.id) {
              return { ...t, watchers: (t.watchers || []).filter(w => w.toLowerCase() !== watcher.toLowerCase()) }
            }
            return t;
          });
          setTickets(u);
          const changedTicket = u.find(t => t.id === activeTicket.id);
          if (changedTicket) syncTicketUpdate(changedTicket.id, { watchers: changedTicket.watchers || [] });
          showToast(`Removed ${watcher}.`, 'info');
          logAuditAction(activeTicket.id, 'TICKET_WATCHER_REMOVED', `Removed ${watcher} from ticket ${activeTicket.id}`);
          setRemoveWatcherConfirm(null);
        }}
        title="Remove Watcher"
        message={`Remove watcher ${removeWatcherConfirm} from ticket ${activeTicket.id}? They will stop receiving notifications for this ticket.`}
        confirmLabel="Remove"
        variant="danger"
      />
    </>
  );
}
