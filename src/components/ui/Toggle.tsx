import { forwardRef, useId } from 'react';
import type { ToggleProps } from '../../types/ui';

const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const toggleId = id || `toggle-${generatedId}`;

    return (
      <label htmlFor={toggleId} className={`inline-flex items-center gap-3 cursor-pointer ${className}`}>
        <div className="relative">
          <input
            ref={ref}
            id={toggleId}
            type="checkbox"
            className="sr-only peer"
            {...props}
          />
          <div className="w-9 h-5 bg-slate-300 rounded-full peer-checked:bg-accent transition-colors duration-200" />
          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-surface-elevated rounded-full shadow-sm peer-checked:translate-x-4 transition-transform duration-200" />
        </div>
        {label && <span className="text-sm text-text-primary select-none">{label}</span>}
      </label>
    );
  }
);

Toggle.displayName = 'Toggle';
export default Toggle;
