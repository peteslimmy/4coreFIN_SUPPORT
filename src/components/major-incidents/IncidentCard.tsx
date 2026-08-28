import React from 'react';
import type { MajorIncidentRecord } from '../../types/app';

interface IncidentCardProps {
  key?: React.Key;
  incident: MajorIncidentRecord;
  linkedCount: number;
  onSelect: (id: string) => void;
}

export default function IncidentCard({ incident, linkedCount, onSelect }: IncidentCardProps) {
  return (
    <div className="bg-surface-elevated rounded-xl shadow-card p-5 relative overflow-hidden flex flex-col justify-between hover:shadow-md transition duration-250">
      <div className={`absolute top-0 left-0 w-full h-1.5 ${incident.severity === 'CRITICAL' ? 'bg-error' : 'bg-warning'}`} aria-hidden="true" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-text-muted bg-surface px-2 py-0.5 rounded border border-border">{incident.id}</span>
          <span className={`text-overline font-semibold px-2 py-0.5 rounded-full uppercase ${incident.active ? 'bg-error-light text-error-dark border border-error-light' : 'bg-success-light text-success-dark border border-success-light'}`}>{incident.status}</span>
        </div>
        <div>
          <h4 className="font-bold text-sm text-text-primary leading-tight mb-1">{incident.name}</h4>
          <p className="text-xs text-text-secondary line-clamp-2 italic">"{incident.description || 'No initial findings provided.'}"</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-overline text-text-secondary font-semibold bg-surface p-2 rounded">
          <div><span className="text-text-muted block uppercase text-overline">Vendor</span><span className="text-text-primary font-bold">{incident.partner}</span></div>
          <div><span className="text-text-muted block uppercase text-overline">Severity</span><span className="text-error font-bold">{incident.severity}</span></div>
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-border flex justify-between items-center shrink-0">
        <span className="text-overline text-text-muted font-bold uppercase tracking-wider">{linkedCount} Linked Complaints</span>
        <button onClick={() => onSelect(incident.id)} aria-label={`Open command room for ${incident.id}`} className="text-xs font-bold text-info hover:text-info transition flex items-center gap-1 cursor-pointer">Command Room →</button>
      </div>
    </div>
  );
}
