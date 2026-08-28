import React from 'react';
import { Sliders, CheckCircle2, ShieldAlert } from 'lucide-react';
import { normalizeStatus, nextStatuses } from '../../lib/majorIncidentStateMachine';
import type { MajorIncidentRecord } from '../../types/app';

interface IncidentLifecycleControlsProps {
  incident: MajorIncidentRecord;
  canManage: boolean;
  onTransition: (miId: string, target: string) => void;
  onAcknowledge: () => void;
}

export default function IncidentLifecycleControls({ incident, canManage, onTransition, onAcknowledge }: IncidentLifecycleControlsProps) {
  const next = canManage ? nextStatuses(incident) : [];

  return (
    <div className="bg-surface-elevated rounded-xl p-5 space-y-4">
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
        <Sliders className="w-4 h-4 text-accent" /> Incident Controls
      </h4>
      <div className="space-y-3">
        <label className="block text-overline text-text-muted font-bold uppercase mb-1">Lifecycle Controls</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['DECLARED', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED'] as const).map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-overline text-text-muted" aria-hidden="true">→</span>}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${normalizeStatus(incident.status) === s ? 'bg-accent text-[#fff]' : 'bg-surface text-text-muted border border-border'}`}>{s.slice(0, 4)}</span>
            </React.Fragment>
          ))}
        </div>
        {canManage && (
          next.length > 0 ? (
            <div className="flex flex-col gap-2 pt-1">
              {normalizeStatus(incident.status) === 'DECLARED' && (
                <button onClick={onAcknowledge}
                  className="px-3 py-2 bg-accent hover:bg-accent-light text-[#fff] rounded text-xs font-bold transition cursor-pointer focus-ring">
                  <CheckCircle2 className="w-4 h-4 inline mr-1 -mt-0.5" /> Acknowledge &amp; Begin Investigation
                </button>
              )}
              {next.map((s) => (
                <button key={s} onClick={() => onTransition(incident.id, s)}
                  className="px-3 py-2 bg-surface hover:bg-surface-hover border border-border rounded text-xs font-bold text-text-primary transition cursor-pointer focus-ring text-left">
                  <ShieldAlert className="w-4 h-4 inline mr-1 -mt-0.5 text-accent" /> Mark {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted italic">No further transitions available.</p>
          )
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="bg-surface p-2.5 rounded border border-border">
          <span className="text-overline text-text-muted font-bold uppercase block">Affected Payment Partner</span>
          <span className="font-bold text-text-primary mt-0.5 block">{incident.partner}</span>
        </div>
        <div className="bg-surface p-2.5 rounded border border-border">
          <span className="text-overline text-text-muted font-bold uppercase block">Severity Category</span>
          <span className="font-bold text-error mt-0.5 block">{incident.severity}</span>
        </div>
      </div>
    </div>
  );
}
