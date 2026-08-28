import type { TicketStatus, TicketPriority } from '../../types/app';
import { TICKET_STATUS_LABELS } from '../../lib/utils';

interface StatusBadgeProps {
  status?: TicketStatus;
  priority?: TicketPriority;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  RECEIPT: { bg: 'bg-[var(--color-status-receipt-bg)]', text: 'text-[var(--color-status-receipt-text)]' },
  ASSIGNED: { bg: 'bg-[var(--color-status-progress-bg)]', text: 'text-[var(--color-status-progress-text)]' },
  INVESTIGATE: { bg: 'bg-[var(--color-status-investigation-bg)]', text: 'text-[var(--color-status-investigation-text)]' },
  WAITING_CUSTOMER: { bg: 'bg-warning-light dark:bg-warning/30', text: 'text-warning-dark dark:text-warning' },
  WAITING_PARTNER: { bg: 'bg-warning-light dark:bg-warning/30', text: 'text-warning-dark dark:text-warning' },
  WAITING_INTERNAL: { bg: 'bg-warning-light dark:bg-warning/30', text: 'text-warning-dark dark:text-warning' },
  RESOLVED: { bg: 'bg-[var(--color-status-resolved-bg)]', text: 'text-[var(--color-status-resolved-text)]' },
  CLOSED: { bg: 'bg-[var(--color-status-closed-bg)]', text: 'text-[var(--color-status-closed-text)]' },
};

const priorityStyles: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: 'bg-[var(--color-priority-critical-bg)]', text: 'text-[var(--color-priority-critical-text)]' },
  HIGH: { bg: 'bg-[var(--color-priority-high-bg)]', text: 'text-[var(--color-priority-high-text)]' },
  MEDIUM: { bg: 'bg-[var(--color-priority-medium-bg)]', text: 'text-[var(--color-priority-medium-text)]' },
  LOW: { bg: 'bg-[var(--color-priority-low-bg)]', text: 'text-[var(--color-priority-low-text)]' },
};

const sizeStyles = {
  sm: 'text-[11px] leading-none px-2 py-1',
  md: 'text-xs leading-none px-2.5 py-1',
};

export default function StatusBadge({ status, priority, label, size = 'sm', className = '' }: StatusBadgeProps) {
  const style = status ? statusStyles[status] : priority ? priorityStyles[priority] : null;
  const displayLabel = label || (status ? (TICKET_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')) : priority || '');

  if (!style) {
    return (
      <span className={`inline-flex items-center font-semibold tracking-wider rounded-md ${sizeStyles[size]} bg-surface-hover text-text-muted ${className}`}>
        {displayLabel}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center font-semibold tracking-wider rounded-md ${sizeStyles[size]} ${style.bg} ${style.text} ${className}`}>
      {displayLabel}
    </span>
  );
}
