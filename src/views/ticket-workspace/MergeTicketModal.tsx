import React, { useState, useMemo } from 'react';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import type { TicketRecord } from '../../types/app';

interface MergeTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (targetTicketId: string) => void;
  tickets: TicketRecord[];
  activeTicketId: string;
  activePartner: string;
}

export default function MergeTicketModal({
  isOpen,
  onClose,
  onConfirm,
  tickets,
  activeTicketId,
  activePartner,
}: MergeTicketModalProps) {
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState('');

  const availableTickets = useMemo(
    () => tickets.filter(t => t.id !== activeTicketId && !t.isDeleted),
    [tickets, activeTicketId]
  );

  const partnerMismatch = useMemo(() => {
    const target = tickets.find(t => t.id === targetId.trim());
    if (!target) return false;
    return (target.partner || '').toLowerCase() !== (activePartner || '').toLowerCase();
  }, [tickets, targetId, activePartner]);

  const handleConfirm = () => {
    const trimmed = targetId.trim();
    if (!trimmed) { setError('Enter a target ticket ID.'); return; }
    if (trimmed === activeTicketId) { setError('Cannot merge a ticket into itself.'); return; }
    const target = tickets.find(t => t.id === trimmed);
    if (!target) { setError('Target ticket not found.'); return; }
    if (target.isDeleted) { setError('Target ticket is archived and cannot receive a merge.'); return; }
    onConfirm(trimmed);
    setTargetId('');
    setError('');
  };

  const handleClose = () => {
    setTargetId('');
    setError('');
    onClose();
  };

return (
    <Modal open={isOpen} onClose={handleClose} title="Merge Tickets" size="sm">
      <div className="space-y-4">
        <Input
          label="Target Ticket ID"
          value={targetId}
          onChange={e => { setTargetId(e.target.value); setError(''); }}
          placeholder="e.g. TK-0042"
          error={error}
          autoFocus
        />

        {partnerMismatch && (
          <div className="bg-warning/10 border border-warning/20 rounded-xl px-4 py-3">
            <p className="text-xs text-warning-dark font-medium">
              Cross-partner merge warning: the target ticket belongs to a different payment partner. Merging across partners could misroute the case.
            </p>
          </div>
        )}

        {availableTickets.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Available Tickets</p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
              {availableTickets.slice(0, 20).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTargetId(t.id); setError(''); }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-surface-hover transition-colors duration-150 ${
                    targetId === t.id ? 'bg-accent/10 text-accent' : 'text-text-primary'
                  }`}
                >
                  <span className="font-mono font-semibold">{t.id}</span>
                  <span className="text-text-muted truncate ml-2">{t.customerName}</span>
                  <span className="text-text-muted ml-2">{t.partner}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-all duration-200 focus-ring"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-bold text-white rounded-xl transition-all duration-200 bg-error hover:bg-error-dark active:bg-error-dark focus-ring"
          >
            Merge
          </button>
        </div>
      </div>
    </Modal>
  );
}