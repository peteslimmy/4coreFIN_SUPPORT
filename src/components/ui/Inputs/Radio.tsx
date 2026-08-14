import React from 'react';

interface RadioItem {
  value: string;
  label: string;
}

interface RadioGroupProps extends React.GroupProps<HTMLInputElement> {
  options: RadioItem[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function RadioGroup({ options, value, onValueChange, disabled = false }: RadioGroupProps) {
  return (
    <div className="flex gap-2 select-none">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary cursor-pointer hover:bg-surface hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => onValueChange(option.value)}
        >
          <input
            type="radio"
            name={options[0]?.value || 'radio-group'}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            className="rounded w-4 h-4 flex items-center justify-center text-current"
            aria-label={option.label}
          />
          <span className="text-text-primary">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

interface RadioItem {
  value: string;
  label: string;
}

export function RadioSelector({
  options,
  value,
  onValueChange,
  disabled = false,
  className,
}: React.ComponentPropsWithoutRef<'div'> & {
  options: RadioItem[];
}) {
  return (
    <div className={className}>
      <RadioGroup options={options} value={value} onValueChange={onValueChange} disabled={disabled} />
    </div>
  );
}

RadioSelector.displayName = 'RadioSelector';