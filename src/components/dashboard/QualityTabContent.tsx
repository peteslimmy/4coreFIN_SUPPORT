import { Zap, Star, Sliders } from 'lucide-react';
import ProgressBar from '../ui/ProgressBar';
import Button from '../ui/Button';
import { formatCurrency } from '../../lib/utils';
import type { ExecutiveInsight } from '../../lib/executiveMetrics';

interface QualityTabContentProps {
  categoryBreakdown: { category: string; count: number; value: number }[];
  priorityBreakdown: { priority: string; count: number }[];
  ratedTickets: { feedbackScore?: number | null }[];
  activeTicketsCount: number;
  healthScore: number;
  healthColor: string;
  fcr: number;
  csatAvg: number;
  atRiskExposure: number;
  insights: ExecutiveInsight[];
  onDownloadPdf: () => void;
  onExportCsv: () => void;
}

export default function QualityTabContent({
  categoryBreakdown: _categoryBreakdown, priorityBreakdown, ratedTickets, activeTicketsCount,
  healthScore, healthColor, fcr, csatAvg, atRiskExposure, insights,
  onDownloadPdf, onExportCsv,
}: QualityTabContentProps) {
  return (
    <div className="space-y-5">
      {/* Priority Distribution */}
      <div className="bg-surface-elevated rounded-xl shadow-card p-5">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-error" /> Priority Distribution
        </h3>
        <div className="space-y-2">
          {priorityBreakdown.map(p => {
            const total = activeTicketsCount || 1;
            const pct = (p.count / total) * 100;
            const colorMap: Record<string, 'error' | 'warning' | 'primary' | 'neutral'> = { CRITICAL: 'error', HIGH: 'warning', MEDIUM: 'primary', LOW: 'neutral' };
            return (
              <ProgressBar key={p.priority} value={pct} max={100} size="sm" color={colorMap[p.priority]} showLabel label={`${p.priority} ${p.count}`} className="w-full" />
            );
          })}
        </div>
      </div>

      {/* Satisfaction Distribution */}
      <div className="bg-surface-elevated rounded-xl shadow-card p-5">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-warning" /> Satisfaction Distribution
        </h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map(star => {
            const count = ratedTickets.filter(t => Math.round(t.feedbackScore ?? 0) === star).length;
            const pct = ratedTickets.length > 0 ? (count / ratedTickets.length * 100) : 0;
            return (
              <ProgressBar key={star} value={pct} max={100} size="sm" color="warning" showLabel label={`${star}★ ${count} (${pct.toFixed(0)}%)`} className="w-full" />
            );
          })}
        </div>
      </div>

      {/* Executive Briefing */}
      <div className="bg-accent/10 rounded-xl p-5">
        <h4 className="text-xs font-semibold text-primary-dark mb-3 flex items-center gap-2">
          <Sliders className="w-4 h-4" /> Executive Briefing
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {insights.map((ins, i) => (
            <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border ${
              ins.type === 'error' ? 'bg-error/5 border-error/15' : ins.type === 'warning' ? 'bg-warning/5 border-warning/15' : 'bg-surface border-border-subtle'
            }`}>
              <span aria-hidden="true" className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${ins.type === 'error' ? 'bg-error animate-pulse' : ins.type === 'warning' ? 'bg-warning' : 'bg-info'}`} />
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-text-primary">{ins.title}</p>
                <p className="text-[11px] text-text-muted">{ins.message}</p>
                {ins.action && <span className="text-[10px] font-semibold text-accent">{ins.action}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-body-sm text-text-primary">
          <span>Health Score: <strong className={healthColor}>{healthScore}%</strong></span>
          <span>FCR: <strong>{fcr.toFixed(1)}%</strong></span>
          <span>CSAT: <strong>{csatAvg ? `${csatAvg.toFixed(2)}/5` : 'N/A'}</strong></span>
          <span>At-Risk Exposure: <strong className="text-warning-dark">{formatCurrency(atRiskExposure)}</strong></span>
        </div>
        <div className="flex gap-3">
          <Button onClick={onDownloadPdf} variant="primary" size="sm">Download PDF</Button>
          <Button onClick={onExportCsv} variant="outlined" size="sm">Export CSV</Button>
        </div>
      </div>
    </div>
  );
}
