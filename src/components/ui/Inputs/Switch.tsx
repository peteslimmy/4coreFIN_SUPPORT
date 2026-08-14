import React, { useState } from 'react';

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  disabled?: boolean;
  _className?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({
  checked = false,
  disabled = false,
  _className,
  onCheckedChange,
  ..._props
}: SwitchProps) {
  const [isChecked, setIsChecked] = useState(checked);


  return (
    <div className="relative inline-flex items-center gap-2 rounded-full px-2 py-1.5 transition-colors select-none">
      <button
        type="button"
        className="flex-1 rounded-full bg-surface border-2 border-border cursor-pointer hover:bg-surface-focus-visible disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        aria-checked={isChecked}
        aria-label={isChecked ? 'Disable' : 'Enable'}
      >
        <span
          className="absolute left-0.5 top-0.5 bottom-0.5 w-5 h-5 rounded-full bg-surface border-2 border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          {isChecked ? (
            <svg
              className="absolute left-0.5 top-0.5 bottom-0.5 w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg
              className="absolute left-0.5 top-0.5 bottom-0.5 w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14l4-4l4 4" />
            </svg>
          )}
        </span>
      </button>
      <input
        type="checkbox"
        checked={isChecked}
        disabled={disabled}
        className="absolute opacity-0 w-1 h-1"
        onChange={(e) => {
          setIsChecked(e.target.checked);
          onCheckedChange?.(e.target.checked);
        }}
      />
    </div>
  );
}

Switch.displayName = 'Switch';