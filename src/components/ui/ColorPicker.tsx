import { useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [hex, setHex] = useState(value);

  const handleChange = (newHex: string) => {
    setHex(newHex);
    if (/^#[0-9A-Fa-f]{6}$/.test(newHex)) {
      onChange(newHex);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={hex}
          onChange={(e) => handleChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-border-subtle cursor-pointer p-0.5"
        />
      </div>
      <div className="flex-1">
        {label && <label htmlFor={`color-${label}`} className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
        <input
          id={`color-${label}`}
          type="text"
          value={hex}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full text-xs bg-surface border border-border-subtle rounded-lg px-3 py-1.5 font-mono focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}
