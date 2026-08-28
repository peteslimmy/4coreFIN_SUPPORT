import { Lock, RefreshCcw } from 'lucide-react';
import type { MajorIncidentRecord } from '../../types/app';

interface IncidentAdvisoryBroadcastsProps {
  incident: MajorIncidentRecord;
  canManage: boolean;
  retryingNotifId: string | null;
  onRetry: (miId: string, notifId: string) => void;
}

export default function IncidentAdvisoryBroadcasts({ incident, canManage, retryingNotifId, onRetry }: IncidentAdvisoryBroadcastsProps) {
  return (
    <div className="bg-surface-elevated rounded-xl shadow-card p-5 space-y-4 shrink-0">
      <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1.5">
        <Lock className="w-4 h-4 text-text-muted" aria-hidden="true" /> Emergency Advisory Broadcasts
      </h4>
      <p className="text-caption text-text-secondary">The declaration broadcast is dispatched over the configured channel. Failed or queued advisories can be re-sent after the channel configuration is fixed.</p>
      {incident.notifications && incident.notifications.length > 0 && (
        <div className="pt-1 space-y-2">
          <span className="text-overline text-text-muted font-bold uppercase tracking-wider block">Dispatched Advisories:</span>
          <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
            {incident.notifications.map((n) => (
              <div key={n.id} className="bg-surface p-2 rounded text-overline text-text-secondary border border-border font-semibold">
                <div className="flex justify-between items-center gap-2">
                  <span className="truncate">{n.channel}: {n.recipient}</span>
                  <span className={`text-[10px] font-mono uppercase px-1.5 rounded ${n.status === 'SENT' ? 'bg-success-light text-success-dark' : n.status === 'FAILED' ? 'bg-error-light text-error-dark' : 'bg-warning-light text-warning-dark'}`}>{n.status}</span>
                </div>
                {n.error && <p className="text-overline text-error mt-1">{n.error}</p>}
                {n.status !== 'SENT' && canManage && (
                  <button onClick={() => onRetry(incident.id, n.id)}
                    disabled={retryingNotifId === n.id}
                    className="mt-1.5 inline-flex items-center gap-1 text-overline font-bold text-info hover:text-info-dark uppercase transition cursor-pointer disabled:opacity-50">
                    <RefreshCcw className="w-3 h-3" /> {retryingNotifId === n.id ? 'Re-dispatching…' : 'Retry'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
