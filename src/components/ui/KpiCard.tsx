import { memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import useRipple from '../../hooks/useRipple';
import { useCountUp } from '../../hooks/useCountUp';
import Tilt3D from './Tilt3D';
import type { KpiCardProps } from '../../types/ui';

const colorStyles: Record<string, string> = {
  brand: 'bg-primary-light text-primary',
  emerald: 'bg-success-light text-success',
  amber: 'bg-warning-light text-warning',
  blue: 'bg-info-light text-info',
  red: 'bg-error-light text-error',
  slate: 'bg-surface-hover text-text-muted',
};

const trendIconMap = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Minus,
};

const trendColorMap: Record<string, string> = {
  up: 'text-success',
  down: 'text-error',
  neutral: 'text-text-muted',
};

function KpiCard({ title, value, trend, icon, color = 'brand', onClick, animateValue = false, format, className = '' }: KpiCardProps) {
  const TrendIcon = trend ? trendIconMap[trend.direction] : null;
  const MotionTag = onClick ? motion.button : motion.div;
  const { onMouseDown, rippleElements } = useRipple(!onClick);
  const isNumeric = typeof value === 'number';
  const count = useCountUp(isNumeric && animateValue ? (value as number) : 0, 900);
  const display = isNumeric && animateValue
    ? (format ? format(count) : Math.round(count).toLocaleString())
    : value;

  return (
    <Tilt3D className={onClick ? 'h-full' : undefined}>
      <MotionTag
        onClick={onClick}
        onMouseDown={onClick ? onMouseDown : undefined}
        className={`bg-surface-card rounded-xl border border-border-subtle p-5 transition-all duration-150 ${
          onClick ? 'hover:border-border hover:shadow-card-hover cursor-pointer text-left w-full relative overflow-hidden' : ''
        } ${className}`}
        aria-label={onClick ? `${title}: ${value}` : undefined}
        whileHover={onClick ? { y: -2, transition: { duration: 0.15 } } : undefined}
        whileTap={onClick ? { scale: 0.98 } : undefined}
      >
        <div className="flex items-start justify-between mb-3">
          {icon && (
            <span className={`p-1.5 rounded-lg ${colorStyles[color] || colorStyles.brand}`}>
              {icon}
            </span>
          )}
          {trend && TrendIcon && (
            <span className={`flex items-center gap-1 text-caption font-medium ${trendColorMap[trend.direction] || 'text-text-muted'}`}>
              <TrendIcon className="w-3 h-3" />
              {trend.label}
            </span>
          )}
        </div>
        <p className="text-h3 font-bold text-text-primary mb-0.5">{display}</p>
        <p className="text-caption text-text-muted font-medium">{title}</p>
        {onClick && rippleElements}
      </MotionTag>
    </Tilt3D>
  );
}

export default memo(KpiCard);
