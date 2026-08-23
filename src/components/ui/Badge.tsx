import { motion } from 'framer-motion';
import type { BadgeProps, BadgeVariant } from '../../types/ui';

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-success-light text-success-dark',
  warning: 'bg-warning-light text-warning-dark',
  error: 'bg-error-light text-error-dark',
  info: 'bg-info-light text-info',
  neutral: 'bg-secondary-light text-secondary',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
  neutral: 'var(--color-secondary)',
};

export default function Badge({ variant = 'neutral', size = 'md', dot, children, className = '' }: BadgeProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      } ${variantStyles[variant]} ${className}`}
    >
      {dot && <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColors[variant] }} />}
      {children}
    </motion.span>
  );
}
