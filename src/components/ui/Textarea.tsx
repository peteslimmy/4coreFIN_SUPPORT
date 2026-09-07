import { forwardRef, useId } from 'react';
import type { TextareaProps } from '../../types/ui';

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || `textarea-${generatedId}`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
            {label}
            {props.required && <span className="text-error ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`w-full h-10 rounded-xl border bg-surface-elevated px-3 text-sm text-text-primary placeholder:text-text-muted transition-all duration-200 focus-ring resize-y min-h-[80px] ${
            error ? 'border-error focus:border-error' : 'border-border focus:border-primary'
          } ${className}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {error && <p id={`${inputId}-error`} className="text-xs text-error animate-slide-in" role="alert">{error}</p>}
        {helperText && !error && <p id={`${inputId}-helper`} className="text-xs text-text-muted">{helperText}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
