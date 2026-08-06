import { useState } from 'react';
import type { GovernanceContext } from '../../types/ui';

interface TooltipPayloadEntry {
  name: string;
  value: number | string;
  color: string;
  dataKey: string;
  payload: Record<string, string | number | boolean | undefined>;
}

interface GovernanceChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  governanceContext?: GovernanceContext;
  formatter?: (value: number | string) => string;
}

const CONTEXT_META: Record<GovernanceContext, { label: string; dotColor: string }> = {
  sla: { label: 'SLA Compliance', dotColor: '#059669' },
  audit: { label: 'Audit Trail', dotColor: '#7c3aed' },
  risk: { label: 'Risk Assessment', dotColor: '#d97706' },
  policy: { label: 'Policy Adherence', dotColor: '#0d9488' },
  general: { label: 'Overview', dotColor: '#2563eb' },
};

export default function GovernanceChartTooltip({ active, payload, label, governanceContext = 'general', formatter }: GovernanceChartTooltipProps) {
  const [expanded, setExpanded] = useState(false);
  if (!active || !payload || payload.length === 0) return null;

  const meta = CONTEXT_META[governanceContext];
  const primary = payload[0];
  const extraKeys = Object.keys(primary?.payload || {}).filter(
    k => !['name', 'value', 'color', 'fill'].includes(k) && typeof primary.payload[k] !== 'object'
  );
  const showExtra = expanded && extraKeys.length > 0;

  return (
    <div className="bg-surface-elevated border border-border-subtle rounded-lg shadow-xl p-3 max-w-[260px]">
      {label && (
        <p className="text-[11px] font-semibold text-text-primary mb-1.5 border-b border-border-subtle pb-1.5">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-text-secondary truncate max-w-[120px]">{entry.name}</span>
            </span>
            <span className="font-mono font-semibold text-text-primary shrink-0">
              {formatter ? formatter(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
      {extraKeys.length > 0 && (
        <div className="mt-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-accent hover:text-accent-light font-medium"
          >
            {expanded ? 'Less' : `+${extraKeys.length} more fields`}
          </button>
          {showExtra && (
            <div className="mt-1 space-y-0.5">
              {extraKeys.map(k => (
                <div key={k} className="flex justify-between text-[10px] text-text-muted">
                  <span>{k}</span>
                  <span className="font-mono">{String(primary.payload[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-1.5 pt-1.5 border-t border-border-subtle flex items-center gap-1.5 text-[10px] text-text-muted">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.dotColor }} />
        {meta.label}
      </div>
    </div>
  );
}
