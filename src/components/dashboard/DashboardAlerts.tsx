import { AlertCircle } from 'lucide-react';

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
}

interface DashboardAlertsProps {
  alerts: Alert[];
}

export default function DashboardAlerts({ alerts }: DashboardAlertsProps) {
  const critical = alerts.filter(a => a.type === 'error' || a.type === 'warning');
  if (critical.length === 0) return null;

  return (
    <div className="bg-surface-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        {critical.some(a => a.type === 'error') ? (
          <AlertCircle className="w-4 h-4 text-error" />
        ) : (
          <AlertCircle className="w-4 h-4 text-warning" />
        )}
        <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Active Alerts</span>
      </div>
      <div className="space-y-2">
        {critical.map(a => (
          <div key={a.id} className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${
            a.type === 'error' ? 'bg-error/5 border border-error/15' : 'bg-warning/5 border border-warning/15'
          }`}>
            <span className="flex items-center gap-2.5 text-body-sm text-text-primary">
              <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full animate-pulse ${a.type === 'error' ? 'bg-error' : 'bg-warning'}`} />
              {a.message}
            </span>
            <span className={`text-caption font-semibold shrink-0 ml-3 ${a.type === 'error' ? 'text-error' : 'text-warning'}`}>
              {a.type === 'error' ? 'Critical' : 'Warning'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
