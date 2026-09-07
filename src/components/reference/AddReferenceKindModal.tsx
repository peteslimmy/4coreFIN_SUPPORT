import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

interface AddKindDraft {
  kind: string;
  label: string;
  labelPlural: string;
  description: string;
  items: string;
}

interface AddReferenceKindModalProps {
  open: boolean;
  onClose: () => void;
  draft: AddKindDraft;
  onDraftChange: (draft: AddKindDraft) => void;
  kindEdited: boolean;
  onKindEdited: () => void;
  saving: boolean;
  onSubmit: () => void;
}

export default function AddReferenceKindModal({
  open, onClose, draft, onDraftChange, kindEdited, onKindEdited, saving, onSubmit,
}: AddReferenceKindModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Reference Kind"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-all duration-200 focus-ring"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-white rounded-xl transition-all duration-200 bg-primary hover:bg-primary-dark active:bg-primary-dark focus-ring disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Kind'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Display Name"
          required
          value={draft.label}
          onChange={(e) => {
            const label = e.target.value;
            const words = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
            const autoKind = words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
            onDraftChange({ ...draft, label, kind: kindEdited ? draft.kind : autoKind });
          }}
          placeholder="e.g. Payment Provider"
        />
        <Input
          label="Storage Key"
          helperText="Used as the reference data key. Auto-generated from the display name; letters, numbers and underscores only."
          value={draft.kind}
          onChange={(e) => {
            onKindEdited();
            onDraftChange({ ...draft, kind: e.target.value });
          }}
          placeholder="e.g. paymentProviders"
        />
        <Input
          label="Plural Label"
          value={draft.labelPlural}
          onChange={(e) => onDraftChange({ ...draft, labelPlural: e.target.value })}
          placeholder="e.g. Payment Providers"
        />
        <Textarea
          label="Description"
          value={draft.description}
          onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
          placeholder="Short description shown to admins"
          rows={2}
        />
        <Textarea
          label="Initial Items (one per line)"
          value={draft.items}
          onChange={(e) => onDraftChange({ ...draft, items: e.target.value })}
          placeholder={'e.g.\nPaystack\nFlutterwave\nPaga'}
          rows={5}
        />
      </div>
    </Modal>
  );
}
