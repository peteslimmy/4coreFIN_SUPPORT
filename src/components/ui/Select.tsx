import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SelectProps } from '../../types/ui';

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || `select-${generatedId}`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
            {label}
            {props.required && <span className="text-error ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            className={`w-full h-10 rounded-xl border bg-surface-elevated px-3 text-sm text-text-primary transition-all duration-200 focus-ring appearance-none pr-10 ${
              error ? 'border-error focus:border-error' : 'border-border focus:border-primary'
            } ${className}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        </div>
        {error && <p id={`${inputId}-error`} className="text-xs text-error animate-slide-in" role="alert">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
