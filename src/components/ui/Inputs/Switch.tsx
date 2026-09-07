import React, { useState, forwardRef } from 'react';

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ checked = false, disabled = false, onCheckedChange, className = '', ...props }, ref) => {
    const [isChecked, setIsChecked] = useState(checked);

    return (
      <label className={`flex items-center gap-2 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
        <span className="relative inline-flex">
          <input
            ref={ref}
            type="checkbox"
            checked={isChecked}
            disabled={disabled}
            onChange={(e) => {
              setIsChecked(e.target.checked);
              onCheckedChange?.(e.target.checked);
            }}
            className="peer absolute opacity-0 w-0 h-0"
            aria-checked={isChecked}
            aria-label={isChecked ? 'Disable' : 'Enable'}
            {...props}
          />
          <span className="relative inline-flex w-10 h-5 rounded-full bg-border peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 transition-all duration-150"></span>
          <span className="absolute left-0.5 top-0.5 bottom-0.5 w-4 h-4 rounded-full bg-white border border-border shadow-sm peer-checked:translate-x-5 transition-transform duration-150 ease-out"></span>
        </span>
      </label>
    );
  }
);

Switch.displayName = 'Switch';
export default Switch;