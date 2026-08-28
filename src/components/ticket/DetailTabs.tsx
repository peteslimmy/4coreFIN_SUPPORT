import type { ReactNode } from 'react';

interface DetailTabsProps {
  active: string;
  onChange: (v: string) => void;
  tabs: { value: string; label: string; icon?: ReactNode }[];
}

export default function DetailTabs({ active, onChange, tabs }: DetailTabsProps) {
  return (
    <nav className="flex items-center gap-1 border-b border-border -mx-5 px-5" role="tablist" aria-label="Ticket detail sections">
      {tabs.map(t => (
        <button
          key={t.value}
          role="tab"
          aria-selected={active === t.value}
          onClick={() => onChange(t.value)}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-200 focus-ring -mb-px ${
            active === t.value
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
