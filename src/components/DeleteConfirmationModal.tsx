import { AlertTriangle } from 'lucide-react';
import Modal from './ui/Modal';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export default function DeleteConfirmationModal({ isOpen, onClose, onConfirm, title, message }: DeleteConfirmationModalProps) {
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
            className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface rounded-lg transition-all duration-200 focus-ring"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-sm font-bold text-[#fff] bg-error hover:bg-error-dark active:bg-error-dark rounded-lg transition-all duration-200 shadow-sm focus-ring"
          >
            Confirm Delete
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center gap-4">
        <div className="p-3 bg-error-light rounded-xl">
          <AlertTriangle className="w-8 h-8 text-error" />
        </div>
        <p className="text-sm text-text-muted">{message}</p>
      </div>
    </Modal>
  );
}
