import type { ReactNode } from 'react';
import type { CardProps } from '../../types/ui';

const paddingStyles: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
};

const Card = ({
  title,
  subtitle,
  icon,
  actions,
  hoverable,
  padding = 'md',
  children,
  className = '',
  onClick,
}: CardProps) => {
  const hasHeader = title !== undefined || icon !== undefined || actions !== undefined;

  return (
    <div
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`bg-surface-card border border-border rounded-xl shadow-1 ${onClick ? 'cursor-pointer' : ''} ${hoverable ? 'transition-shadow hover:shadow-3' : ''} ${className}`}
    >
      {hasHeader && (
        <div className={`flex items-center justify-between gap-3 ${paddingStyles[padding]} pb-0`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-text-secondary shrink-0">{icon}</span>}
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm font-semibold text-text-primary truncate">{title}</h3>
              )}
              {subtitle && (
                <p className="text-xs text-text-secondary mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={paddingStyles[padding]}>{children}</div>
    </div>
  );
};

export default Card;
export type { ReactNode };
