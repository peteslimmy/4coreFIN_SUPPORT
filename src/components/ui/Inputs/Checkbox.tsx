import React, { useState } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  disabled?: boolean;
  _className?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  checked = false,
  disabled = false,
  _className,
  onCheckedChange
}: CheckboxProps) {
  const [isChecked, setIsChecked] = useState(checked);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = e.target.checked;
    setIsChecked(newChecked);
    onCheckedChange?.(newChecked);
  };

  return (
    <div
      className="flex items-center gap-2 select-none cursor-pointer hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={e => {
        e.stopPropagation();
        setIsChecked(!isChecked);
        handleChange(e);
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        disabled={disabled}
        className="rounded border border-current w-4 h-4 flex items-center justify-center text-current shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        aria-label={isChecked ? 'Uncheck' : 'Check'}
      />
      <Check className="w-4 h-4" />
    </div>
  );
}

Checkbox.displayName = 'Checkbox';