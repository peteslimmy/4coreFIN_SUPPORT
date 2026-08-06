import { useState } from 'react';
import { Copy, GitMerge, X, AlertTriangle, BadgeCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import type { DuplicateCandidate } from '../../lib/duplicateDetection';

export type DuplicateChoice = 'create' | 'merge';

interface DuplicateResolutionModalProps {
  open: boolean;
  candidates: DuplicateCandidate[];
  incoming: { customerName: string; category: string; amount: number; evidenceCount: number };
  onResolve: (choice: DuplicateChoice, candidate?: DuplicateCandidate) => void;
  onCancel: () => void;
}

export default function DuplicateResolutionModal({ open, candidates, incoming, onResolve, onCancel }: DuplicateResolutionModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = candidates.find(c => c.ticket.id === selectedId) || candidates[0] || null;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Possible Duplicate Complaint Detected"
      size="md"
      footer={
        <div className="flex justify-between gap-3 w-full flex-wrap">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface rounded-lg transition-all duration-200 focus-ring"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <Button variant="outlined" icon={<Copy className="w-4 h-4" />} onClick={() => onResolve('create')}>
              Create New Ticket
            </Button>
            <Button
              variant="primary"
              icon={<GitMerge className="w-4 h-4" />}
              disabled={!selected}
              onClick={() => selected && onResolve('merge', selected)}
            >
              Merge Into Existing
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-accent-light/10 dark:bg-accent-dark/20 border border-accent-light/30 rounded-lg p-3">
          <AlertTriangle className="w-5 h-5 text-accent-light shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">
            The complaint you are about to file matches one or more existing tickets in the same business unit.
            Merging will <strong>append</strong> the new description and evidence onto the existing ticket while keeping its
            current status unchanged.
          </p>
        </div>

        <div className="text-xs text-text-muted">
          Incoming: <span className="font-semibold text-text-primary">{incoming.customerName}</span> — {incoming.category}
          {incoming.amount > 0 ? ` · ₦${incoming.amount.toLocaleString()}` : ''}
          {incoming.evidenceCount > 0 ? ` · ${incoming.evidenceCount} file(s)` : ''}
        </div>

        <div className="space-y-2">
          {candidates.length === 0 && (
            <p className="text-xs text-text-muted text-center py-4">No matching tickets found.</p>
          )}
          {candidates.map(c => (
            <button
              key={c.ticket.id}
              type="button"
              onClick={() => setSelectedId(c.ticket.id)}
              className={`w-full text-left rounded-lg border p-3 transition-all duration-200 cursor-pointer ${
                selected?.ticket.id === c.ticket.id
                  ? 'border-accent-light bg-accent-light/10 ring-1 ring-accent-light'
                  : 'border-border hover:border-accent-light/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-text-primary">{c.ticket.id}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase">
                  <BadgeCheck className="w-3.5 h-3.5 text-accent-light" />
                  {c.confidence}% match
                </span>
              </div>
              <div className="text-[11px] text-text-muted truncate">{c.ticket.description}</div>
              <div className="text-[11px] text-text-muted mt-1">
                Matched on: <span className="font-semibold text-text-secondary">{c.reason}</span>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="bg-surface-elevated border border-border rounded-lg p-3 text-[11px] text-text-muted space-y-1">
            <div className="font-semibold text-text-primary text-xs mb-1">Merge preview — existing ticket keeps status "{selected.ticket.status}"</div>
            <div>Fields overlaid from new complaint: description, transaction ID, amount, custom fields.</div>
            <div>Evidence files from the new complaint will be appended to ticket {selected.ticket.id}.</div>
            <div className="flex items-center gap-1 text-[10px]">
              <X className="w-3 h-3 text-text-muted" /> The new submission will not create a separate ticket.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
