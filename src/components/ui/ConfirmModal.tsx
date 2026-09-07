import Modal from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default' | 'success';
}

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger' }: ConfirmModalProps) {
  const variantStyles = {
    danger: 'bg-error hover:bg-error-dark active:bg-error-dark',
    default: 'bg-primary hover:bg-primary-dark active:bg-primary-dark',
    success: 'bg-success hover:bg-success-dark active:bg-success-dark',
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-all duration-200 focus-ring"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-all duration-200 focus-ring ${variantStyles[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-body-sm text-text-secondary">{message}</p>
    </Modal>
  );
}
