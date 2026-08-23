import { motion } from 'framer-motion';

type ProgressColor = 'primary' | 'success' | 'warning' | 'error' | 'neutral';

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md';
  color?: ProgressColor;
  showLabel?: boolean;
  label?: string;
  className?: string;
  animated?: boolean;
  key?: string | number;
}

const colorMap: Record<ProgressColor, { bar: string; track: string; text: string }> = {
  primary: { bar: 'bg-primary', track: 'bg-surface-hover', text: 'text-primary' },
  success: { bar: 'bg-success', track: 'bg-surface-hover', text: 'text-success' },
  warning: { bar: 'bg-warning', track: 'bg-surface-hover', text: 'text-warning' },
  error: { bar: 'bg-error', track: 'bg-surface-hover', text: 'text-error' },
  neutral: { bar: 'bg-secondary', track: 'bg-surface-hover', text: 'text-text-muted' },
};

const sizeMap: Record<string, string> = {
  sm: 'h-1',
  md: 'h-1.5',
};

export default function ProgressBar({ value, max = 100, size = 'sm', color = 'primary', showLabel = false, label, className = '', animated = true }: ProgressBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const styles = colorMap[color];

  return (
    <div className={`flex items-center gap-2 ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label || `Progress: ${Math.round(pct)}%`}>
      <div className={`flex-1 rounded-full overflow-hidden ${styles.track} ${sizeMap[size]}`}>
        <motion.div
          initial={animated ? { width: 0 } : undefined}
          animate={{ width: `${pct}%` }}
          transition={animated ? { duration: 0.5, ease: 'easeOut' } : undefined}
          className={`h-full rounded-full ${styles.bar}`}
        />
      </div>
      {showLabel && (
        <span className={`text-caption font-mono font-medium ${styles.text} shrink-0`}>
          {label || `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  );
}
