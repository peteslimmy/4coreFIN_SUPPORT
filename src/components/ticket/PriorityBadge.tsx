const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'var(--color-priority-critical-bg, #FEE2E2)', text: 'var(--color-priority-critical-text, #991B1B)', border: 'var(--color-priority-critical-border, #FECACA)' },
  HIGH:     { bg: 'var(--color-priority-high-bg, #FEF3C7)', text: 'var(--color-priority-high-text, #92400E)', border: 'var(--color-priority-high-border, #FDE68A)' },
  MEDIUM:   { bg: 'var(--color-priority-medium-bg, #EFF6FF)', text: 'var(--color-priority-medium-text, #1E40AF)', border: 'var(--color-priority-medium-border, #DBEAFE)' },
  LOW:      { bg: 'var(--color-priority-low-bg, #F0FDF4)', text: 'var(--color-priority-low-text, #166534)', border: 'var(--color-priority-low-border, #BBF7D0)' },
};

const DEFAULT_STYLE = PRIORITY_STYLES.LOW;

export default function PriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] || DEFAULT_STYLE;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ring-1 ring-inset"
      style={{ backgroundColor: style.bg, color: style.text, boxShadow: `inset 0 0 0 1px ${style.border}` }}
    >
      {priority}
    </span>
  );
}
