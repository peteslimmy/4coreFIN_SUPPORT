import { forwardRef } from 'react';
import Spinner from './Spinner';
import useRipple from '../../hooks/useRipple';
import type { ButtonProps, ButtonVariant, ButtonSize } from '../../types/ui';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark shadow-2',
  secondary: 'bg-surface-card text-text-primary border border-border hover:bg-surface-hover active:bg-surface-hover',
  outlined: 'bg-transparent text-text-primary border border-border hover:bg-surface-card active:bg-surface-card',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-surface-hover active:bg-surface-hover',
  danger: 'bg-error text-white hover:bg-error/90 active:bg-error/80 shadow-2',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-[13px] gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
  icon: 'p-2 gap-0',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, icon, iconPosition = 'left', children, className = '', ...props }, ref) => {
    const isDisabled = disabled || loading;
    const { onMouseDown, rippleElements } = useRipple(isDisabled);

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-busy={loading || undefined}
        onMouseDown={onMouseDown}
        className={`relative inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus-ring active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 overflow-hidden ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {!loading && icon && iconPosition === 'left' && <span className="shrink-0 relative z-10">{icon}</span>}
        <span className="relative z-10">{children}</span>
        {!loading && icon && iconPosition === 'right' && <span className="shrink-0 relative z-10">{icon}</span>}
        {rippleElements}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
