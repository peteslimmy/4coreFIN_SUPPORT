import { motion } from 'framer-motion';
import type { EmptyStateProps } from '../../types/ui';
import Button from './Button';
import { Inbox } from 'lucide-react';

export default function EmptyState({ icon, title, message, action, secondaryAction, className = '' }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex w-full max-w-md flex-col items-center justify-center py-8 sm:py-12 px-4 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="text-text-muted mb-5 opacity-80">
        {icon || <Inbox className="w-16 h-16" />}
      </div>
      <h3 className="text-h3 text-text-primary mb-2">{title}</h3>
      {message && <p className="text-body-sm text-text-muted w-full max-w-md mb-4">{message}</p>}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && <Button onClick={action.onClick} variant="primary" size="md">{action.label}</Button>}
          {secondaryAction && <Button onClick={secondaryAction.onClick} variant="secondary" size="md">{secondaryAction.label}</Button>}
        </div>
      )}
    </motion.div>
  );
}
