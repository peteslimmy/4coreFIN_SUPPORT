import Modal from '../ui/Modal';
import type { TicketRecord } from '../../types/app';

interface ComplaintSuccessModalProps {
  record: TicketRecord | null;
  onClose: () => void;
  onViewTickets: () => void;
}

export default function ComplaintSuccessModal({ record, onClose, onViewTickets }: ComplaintSuccessModalProps) {
  if (!record) return null;

  return (
    <Modal
      open={!!record}
      onClose={onClose}
      title="Complaint Submitted Successfully"
      size="md"
      footer={
        <div className="flex justify-between gap-3 w-full flex-wrap">
          <button
            onClick={onViewTickets}
            className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface rounded-lg transition-all duration-200 focus-ring"
          >
            View in Ticket Workspace
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-[#fff] bg-primary hover:bg-primary-dark rounded-lg transition-all duration-200 focus-ring"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-secondary">Your complaint has been logged and routed to the relevant team.</p>
        <div className="bg-surface-elevated border border-border rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-text-muted">Ticket ID</span>
            <span className="font-mono font-bold text-text-primary">{record.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">SLA Deadline</span>
            <span className="font-semibold text-text-primary">{new Date(record.slaDeadline).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Status</span>
            <span className="font-semibold text-text-primary">{record.status}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
