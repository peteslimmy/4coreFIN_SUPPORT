import type { ReactNode } from 'react';

export default function SectionHeader({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="w-5 h-5 rounded bg-primary-light flex items-center justify-center text-primary" aria-hidden="true">{icon}</span>
      <h3 className="text-xs font-heading font-bold text-text-muted uppercase tracking-wide">{label}</h3>
    </div>
  );
}
