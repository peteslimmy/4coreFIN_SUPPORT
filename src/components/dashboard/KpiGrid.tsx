import { BarChart2, Target, AlertTriangle, DollarSign, ThumbsUp, CheckCircle } from 'lucide-react';
import KpiCard from '../ui/KpiCard';
import { formatCurrency, formatCurrencyCompact } from '../../lib/utils';
import { TicketStatus, type TicketRecord } from '../../types/app';

interface KpiGridProps {
  activeTickets: TicketRecord[];
  closedTickets: TicketRecord[];
  escalated: TicketRecord[];
  ratedTickets: TicketRecord[];
  totalExposure: number;
  atRiskExposure: number;
  exposureByPartner: { partner: string; value: number }[];
  fcr: number;
  rft: number;
  deltas: { createdDelta: number; breachDelta: number };
  businessUnits: string[];
  partners: string[];
  scopedTickets: TicketRecord[];
  onDrillDown: (title: string, rows: { label: string; value: string }[]) => void;
}

export default function KpiGrid({
  activeTickets, closedTickets, escalated, ratedTickets,
  totalExposure, atRiskExposure, exposureByPartner,
  fcr, rft, deltas, businessUnits, partners, scopedTickets, onDrillDown,
}: KpiGridProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      <KpiCard
        title="Active Complaints"
        value={activeTickets.length}
        icon={<BarChart2 className="w-5 h-5" />}
        color="blue"
        animateValue
        trend={{ direction: 'down', label: `Δ ${deltas.createdDelta >= 0 ? '+' : ''}${deltas.createdDelta}%` }}
        onClick={() => {
          const byBu = businessUnits.map(bu => ({ label: bu, value: scopedTickets.filter(t => t.businessUnit === bu && t.status !== TicketStatus.CLOSED).length.toString() }));
          onDrillDown('Active Complaints by BU', byBu.concat([{ label: 'Total', value: activeTickets.length.toString() }]));
        }}
      />
      <KpiCard
        title="FCR Rate"
        value={fcr}
        icon={<Target className="w-5 h-5" />}
        color="emerald"
        animateValue
        format={(n) => `${n.toFixed(1)}%`}
        trend={{ direction: fcr > 70 ? 'up' : 'down', label: fcr > 70 ? 'On Target' : 'Below Target' }}
        onClick={() => onDrillDown('First Contact Resolution Detail', [
          { label: 'Resolved Without Escalation', value: closedTickets.filter(t => !t.isEscalated).length.toString() },
          { label: 'Total Closed', value: closedTickets.length.toString() },
          { label: 'FCR Rate', value: `${fcr.toFixed(1)}%` },
        ])}
      />
      <KpiCard
        title="SLA Breaches"
        value={escalated.length}
        icon={<AlertTriangle className="w-5 h-5" />}
        color="red"
        animateValue
        trend={{ direction: escalated.length === 0 ? 'up' : 'down', label: escalated.length === 0 ? 'Clear' : `Δ ${deltas.breachDelta >= 0 ? '+' : ''}${deltas.breachDelta}%` }}
        onClick={() => {
          const byPartner = partners.map(p => ({ label: p, value: scopedTickets.filter(t => t.partner === p && t.isEscalated).length.toString() }));
          onDrillDown('SLA Breaches by Payment Partner', byPartner.concat([{ label: 'Total', value: escalated.length.toString() }]));
        }}
      />
      <KpiCard
        title="Dispute Exposure"
        value={totalExposure}
        icon={<DollarSign className="w-5 h-5" />}
        color="amber"
        animateValue
        format={(n) => formatCurrency(n)}
        trend={{ direction: 'neutral', label: `${formatCurrencyCompact(atRiskExposure)} at risk` }}
        onClick={() => onDrillDown('Exposure by Payment Partner', exposureByPartner.map(e => ({ label: e.partner, value: formatCurrency(e.value) })).concat([{ label: 'Total Exposure', value: formatCurrency(totalExposure) }]))}
      />
      <KpiCard
        title="CSAT Score"
        value={ratedTickets.length > 0 ? `${(ratedTickets.reduce((s, t) => s + (t.feedbackScore || 0), 0) / ratedTickets.length).toFixed(2)} / 5` : 'N/A'}
        icon={<ThumbsUp className="w-5 h-5" />}
        color="emerald"
        trend={{ direction: 'up', label: `${ratedTickets.length} rated` }}
      />
      <KpiCard
        title="RFT Rate"
        value={rft}
        icon={<CheckCircle className="w-5 h-5" />}
        color="blue"
        animateValue
        format={(n) => `${n.toFixed(1)}%`}
        trend={{ direction: rft > 80 ? 'up' : 'down', label: rft > 80 ? 'Healthy' : 'Review' }}
      />
    </div>
  );
}
