import React, { useState, forwardRef } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked = false, disabled = false, onCheckedChange, className = '', ...props }, ref) => {
    const [isChecked, setIsChecked] = useState(checked);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked;
      setIsChecked(newChecked);
      onCheckedChange?.(newChecked);
    };

    return (
      <label className={`flex items-center gap-2 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
        <input
          ref={ref}
          type="checkbox"
          checked={isChecked}
          disabled={disabled}
          onChange={handleChange}
          className="w-4 h-4 rounded border-2 border-border bg-surface-card text-primary focus-ring transition-all duration-150 hover:border-primary"
          aria-label={isChecked ? 'Uncheck' : 'Check'}
          {...props}
        />
        <Check className={`w-4 h-4 ${isChecked ? 'text-primary' : 'invisible'}`} />
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
export default Checkbox;