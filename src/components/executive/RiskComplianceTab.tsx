import { useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck, FileSearch, AlertTriangle, Radio, Users as UsersIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import GovernanceChart from '../ui/GovernanceChart';
import Table from '../ui/Table';
import Button from '../ui/Button';
import ProgressBar from '../ui/ProgressBar';
import { CHART_COLORS, CHART_FILLS } from '../../lib/chartColors';
import { formatCurrency, formatCurrencyCompact } from '../../lib/utils';
import type { TicketRecord } from '../../types/app';
import type { GovernanceContext } from '../../types/ui';
import {
  computeRiskRegister,
  computeComplianceTrend,
  computeExposureBy,
  computeAuditHealth,
  computeIncidentImpact,
  computeAtRiskExposure,
  buildTrendMatrix,
  computeAgentPerformance,
  computeTicketRiskScore,
  type RiskRow,
} from '../../lib/executiveMetrics';

const PIE_COLORS = [CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.emerald, CHART_COLORS.purple, CHART_COLORS.primary, CHART_COLORS.cyan];

export interface DrillRequest {
  title: string;
  subtitle?: string;
  rows: { label: string; value: string; highlight?: boolean }[];
  context: GovernanceContext;
  metadata?: string[];
}

interface RiskComplianceTabProps {
  onDrill: (d: DrillRequest) => void;
  onCrossFilter: (f: { key: string; value: string } | null) => void;
  crossFilter: { key: string; value: string } | null;
}

const RISK_BADGE: Record<string, string> = {
  critical: 'bg-error/10 text-error-dark border-error/20',
  high: 'bg-warning/10 text-warning-dark border-warning/20',
  medium: 'bg-info/10 text-info-dark border-info/20',
  low: 'bg-surface-hover text-text-muted border-border',
};

function formatHours(h: number): string {
  if (h >= 48) return `${Math.round(h / 24)}d`;
  return `${Math.round(h)}h`;
}

export default function RiskComplianceTab({ onDrill, onCrossFilter, crossFilter }: RiskComplianceTabProps) {
  const { tickets, partners, businessUnits, auditLogs, majorIncidents, showToast } = useApp();
  const [heatMapMetric, setHeatMapMetric] = useState<'INCIDENTS' | 'BREACHES'>('INCIDENTS');
  const [riskSort, setRiskSort] = useState<{ field: string; asc: boolean }>({ field: 'riskScore', asc: false });
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);

  const riskRegister = useMemo(() => computeRiskRegister(tickets, now), [tickets, now]);
  const sortedRegister = useMemo(() => {
    const arr = [...riskRegister];
    const { field, asc } = riskSort;
    arr.sort((a: RiskRow, b: RiskRow) => {
      const av = a[field as keyof RiskRow];
      const bv = b[field as keyof RiskRow];
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [riskRegister, riskSort]);
  const handleRiskSort = (field: string) => {
    setRiskSort(prev => ({ field, asc: prev.field === field ? !prev.asc : true }));
  };
  const complianceTrend = useMemo(() => computeComplianceTrend(tickets, 30, now), [tickets, now]);
  const exposureByCategory = useMemo(() => computeExposureBy(tickets, 'category'), [tickets]);
  const exposureByBu = useMemo(() => computeExposureBy(tickets, 'businessUnit'), [tickets]);
  const atRiskExposure = useMemo(() => computeAtRiskExposure(tickets, now), [tickets, now]);
  const auditHealth = useMemo(() => computeAuditHealth(auditLogs), [auditLogs]);
  const incidents = useMemo(() => computeIncidentImpact(majorIncidents, tickets), [majorIncidents, tickets]);
  const heatmap = useMemo(() => buildTrendMatrix(tickets, partners, businessUnits, heatMapMetric), [tickets, partners, businessUnits, heatMapMetric]);
  const agents = useMemo(() => computeAgentPerformance(tickets), [tickets]);

  const auditActionData = useMemo(() => Object.entries(auditHealth.byAction).map(([name, value]) => ({ name, value })), [auditHealth.byAction]);
  const auditActorData = useMemo(() => Object.entries(auditHealth.byActor).map(([name, value]) => ({ name, value })), [auditHealth.byActor]);
  const severityData = useMemo(() => {
    const map = new Map<string, number>();
    majorIncidents.forEach(mi => map.set(mi.severity, (map.get(mi.severity) || 0) + 1));
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [majorIncidents]);

  const heatMax = Math.max(...heatmap.map(h => h.value), 1);
  const heatColor = (v: number) => `rgba(59, 130, 246, ${0.08 + (v / heatMax) * 0.85})`;

  const exportRiskCsv = () => {
    const headers = ['Ticket', 'Customer', 'Payment Partner', 'Business Unit', 'Category', 'Priority', 'Status', 'Amount', 'Age', 'SLA Remaining', 'Risk Score'];
    const rows = riskRegister.map(r => [r.id, r.customerName, r.partner, r.businessUnit, r.category, r.priority, r.status, r.amount, formatHours(r.ageHours), formatHours(r.slaRemainingHours), r.riskScore]);
    const csv = "data:text/csv;charset=utf-8," + [headers, ...rows].map(r => r.join(',')).join('\n');
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = "executive_risk_register.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Risk register exported as CSV.');
  };

  const openTicketDrill = (t: TicketRecord) => {
    onDrill({
      title: `Risk Detail — ${t.id}`,
      subtitle: t.customerName,
      context: 'risk',
      rows: [
        { label: 'Payment Partner', value: t.partner },
        { label: 'Business Unit', value: t.businessUnit },
        { label: 'Category', value: t.category },
        { label: 'Priority', value: t.priority },
        { label: 'Status', value: t.status },
        { label: 'Amount', value: formatCurrency(t.amount) },
        { label: 'Age', value: formatHours((now - new Date(t.createdAt).getTime()) / 3600000) },
        { label: 'SLA Remaining', value: formatHours((new Date(t.slaDeadline).getTime() - now) / 3600000) },
        { label: 'Risk Score', value: `${computeTicketRiskScore(t, now)} / 100` },
      ],
      metadata: [t.isEscalated ? 'SLA breached — immediate escalation active.' : 'Ticket within SLA.', t.assignedAgentId ? `Assigned: ${t.assignedAgentId}` : 'Unassigned'],
    });
  };

  const riskTableColumns = [
    { key: 'id', header: 'Ticket', sortable: true, render: (r: RiskRow) => <span className="font-mono font-bold text-text-primary">{r.id}</span> },
    { key: 'customerName', header: 'Customer', sortable: true, render: (r: RiskRow) => <span className="text-text-secondary">{r.customerName}</span> },
    { key: 'partner', header: 'Payment Partner', sortable: true, render: (r: RiskRow) => <span>{r.partner}</span> },
    { key: 'priority', header: 'Priority', sortable: true, render: (r: RiskRow) => (
      <span className={`font-mono text-caption font-bold ${r.priority === 'CRITICAL' ? 'text-error' : r.priority === 'HIGH' ? 'text-warning' : 'text-text-muted'}`}>{r.priority}</span>
    )},
    { key: 'amount', header: 'Amount', align: 'right' as const, sortable: true, render: (r: RiskRow) => <span className="font-mono">{formatCurrencyCompact(r.amount)}</span> },
    { key: 'ageHours', header: 'Age', align: 'right' as const, sortable: true, render: (r: RiskRow) => <span className="font-mono text-text-muted">{formatHours(r.ageHours)}</span> },
    { key: 'slaRemainingHours', header: 'SLA Left', align: 'right' as const, sortable: true, render: (r: RiskRow) => {
      const color = r.slaRemainingHours < 0 ? 'text-error' : r.slaRemainingHours < 24 ? 'text-warning' : 'text-success';
      return <span className={`font-mono ${color}`}>{r.slaRemainingHours < 0 ? `Breached -${formatHours(Math.abs(r.slaRemainingHours))}` : formatHours(r.slaRemainingHours)}</span>;
    }},
    { key: 'riskScore', header: 'Risk', align: 'right' as const, sortable: true, render: (r: RiskRow) => (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${RISK_BADGE[r.riskLevel]}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {r.riskLevel} · {r.riskScore}
      </span>
    )},
  ];

  return (
    <div className="space-y-5" role="tabpanel" id="tabpanel-risk" aria-labelledby="tab-risk">
      {/* At-risk exposure strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-card rounded-xl border border-border-subtle p-4 flex items-center gap-3">
          <span className="p-2 rounded-lg bg-error/10 text-error"><AlertTriangle className="w-5 h-5" /></span>
          <div>
            <p className="text-overline text-text-muted uppercase tracking-wider">At-Risk Exposure</p>
            <p className="text-h3 font-bold text-text-primary">{formatCurrency(atRiskExposure)}</p>
          </div>
        </div>
        <div className="bg-surface-card rounded-xl border border-border-subtle p-4 flex items-center gap-3">
          <span className="p-2 rounded-lg bg-warning/10 text-warning"><Radio className="w-5 h-5" /></span>
          <div>
            <p className="text-overline text-text-muted uppercase tracking-wider">Audit Trail Entries</p>
            <p className="text-h3 font-bold text-text-primary">{auditHealth.total} <span className="text-body-sm font-medium text-text-muted">({auditHealth.verified} chained)</span></p>
          </div>
        </div>
        <div className="bg-surface-card rounded-xl border border-border-subtle p-4 flex items-center gap-3">
          <span className="p-2 rounded-lg bg-info/10 text-info"><ShieldCheck className="w-5 h-5" /></span>
          <div>
            <p className="text-overline text-text-muted uppercase tracking-wider">Active Major Incidents</p>
            <p className="text-h3 font-bold text-text-primary">{majorIncidents.filter(mi => mi.active).length} <span className="text-body-sm font-medium text-text-muted">/ {majorIncidents.length}</span></p>
          </div>
        </div>
      </div>

      {/* Risk Register */}
      <div className="bg-surface-elevated rounded-xl shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-error" /> Executive Risk Register
          </h3>
          <Button variant="outlined" size="sm" onClick={exportRiskCsv}>Export CSV</Button>
        </div>
        {riskRegister.length === 0 ? (
          <p className="text-body-sm text-text-muted text-center py-6">No open tickets at risk. All clear.</p>
        ) : (
          <Table
            columns={riskTableColumns}
            data={sortedRegister}
            keyExtractor={(r: RiskRow) => r.id}
            sortable
            sortField={riskSort.field}
            sortDirection={riskSort.asc ? 'asc' : 'desc'}
            onSort={handleRiskSort}
            onRowClick={(r: RiskRow) => {
              const t = tickets.find(x => x.id === r.id);
              if (t) openTicketDrill(t);
            }}
          />
        )}
      </div>

      {/* SLA Compliance Trend + Financial Exposure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GovernanceChart
          type="composed"
          data={complianceTrend}
          config={{
            xKey: 'label',
            yKeys: [{ key: 'breached', name: 'Breaches', color: CHART_COLORS.primary, fill: CHART_FILLS.primary }],
            y2Keys: [{ key: 'compliance', name: 'Compliance %', color: CHART_COLORS.emerald }],
            showGrid: true,
          }}
          title="SLA Compliance Trend"
          subtitle="Breaches (bars) vs compliance rate (line, 95% target)"
          governanceContext="sla"
          height={240}
          valueFormatter={(v) => `${Math.round(v)}%`}
          onDrillDown={(info) => {
            const e = info.payload;
            onDrill({
              title: 'Compliance Detail',
              subtitle: info.label,
              context: 'sla',
              rows: [
                { label: 'Date', value: info.label },
                { label: 'Breached', value: `${e?.breached ?? 0}` },
                { label: 'Compliance', value: `${Number(e?.compliance ?? 0).toFixed(0)}%` },
              ],
            });
          }}
          onCrossFilter={onCrossFilter}
          crossFilter={crossFilter}
        />

        <div className="bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-warning" /> Financial Exposure by Category
          </h3>
          <GovernanceChart
            type="donut"
            data={exposureByCategory}
            config={{ nameKey: 'name', valueKey: 'value', colors: PIE_COLORS }}
            title=""
            governanceContext="risk"
            height={220}
            valueFormatter={(v) => formatCurrencyCompact(v)}
            onDrillDown={(info) => {
              const e = info.payload;
              onDrill({
                title: 'Category Exposure',
                subtitle: info.label,
                context: 'risk',
                rows: [
                  { label: 'Category', value: info.label },
                  { label: 'Exposure', value: formatCurrency(e?.value ?? 0) },
                  { label: 'Open Tickets', value: `${e?.count ?? 0}` },
                ],
              });
            }}
            onCrossFilter={onCrossFilter}
            crossFilter={crossFilter}
          />
        </div>
      </div>

      {/* BU treemap + Agent heat capacity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GovernanceChart
          type="treemap"
          data={exposureByBu}
          config={{ nameKey: 'name', valueKey: 'value', colors: PIE_COLORS }}
          title="Exposure by Business Unit"
          governanceContext="risk"
          height={220}
          valueFormatter={(v) => formatCurrencyCompact(v)}
          onDrillDown={(info) => {
            const e = info.payload;
            onDrill({
              title: 'Business Unit Exposure',
              subtitle: info.label,
              context: 'risk',
              rows: [
                { label: 'Business Unit', value: info.label },
                { label: 'Exposure', value: formatCurrency(e?.value ?? 0) },
                { label: 'Open Tickets', value: `${e?.count ?? 0}` },
              ],
            });
          }}
          onCrossFilter={onCrossFilter}
          crossFilter={crossFilter}
        />

        <div className="bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
              <UsersIcon className="w-4 h-4 text-info" /> Agent Capacity & SLA
            </h3>
          </div>
          <div className="space-y-3">
            {agents.map(a => {
              const maxActive = Math.max(...agents.map(x => x.active), 1);
              const slaColor: 'success' | 'warning' | 'error' = a.slaPercent >= 95 ? 'success' : a.slaPercent >= 90 ? 'warning' : 'error';
              return (
                <div key={a.agent}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="font-medium text-text-primary">{a.agent}</span>
                    <span className="font-mono text-text-muted">{a.active} active · SLA {a.slaPercent.toFixed(0)}%</span>
                  </div>
                  <ProgressBar value={a.active} max={maxActive} size="md" color={slaColor} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Major Incidents + Audit Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
            <Radio className="w-4 h-4 text-error" /> Major Incident Impact
          </h3>
          {incidents.length === 0 ? (
            <p className="text-body-sm text-text-muted text-center py-6">No major incidents recorded.</p>
          ) : (
            <>
              <GovernanceChart
                type="donut"
                data={severityData}
                config={{ nameKey: 'name', valueKey: 'value', colors: PIE_COLORS }}
                title=""
                governanceContext="risk"
                height={150}
                onDrillDown={(info) => onDrill({ title: 'Severity Mix', subtitle: info.label, context: 'risk', rows: [{ label: 'Severity', value: info.label }, { label: 'Incidents', value: `${info.payload?.value ?? 0}` }] })}
                onCrossFilter={onCrossFilter}
                crossFilter={crossFilter}
              />
              <div className="space-y-2 mt-3">
                {incidents.map(({ incident, linkedTickets }) => (
                  <div key={incident.id} className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border-subtle">
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold text-text-primary truncate">{incident.name}</p>
                      <p className="text-[11px] text-text-muted truncate">{incident.partner} · {incident.category}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${incident.active ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}`}>{incident.status}</span>
                      <p className="text-[10px] text-text-muted mt-1">{linkedTickets.length} linked · PIR {incident.pir?.draft ? 'draft' : 'submitted'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-chart-purple" /> Compliance & Audit Health
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <GovernanceChart
              type="donut"
              data={auditActionData}
              config={{ nameKey: 'name', valueKey: 'value', colors: PIE_COLORS }}
              title=""
              governanceContext="audit"
              height={160}
              onDrillDown={(info) => onDrill({ title: 'Audit Action', subtitle: info.label, context: 'audit', rows: [{ label: 'Action', value: info.label }, { label: 'Count', value: `${info.payload?.value ?? 0}` }] })}
              onCrossFilter={onCrossFilter}
              crossFilter={crossFilter}
            />
            <GovernanceChart
              type="bar"
              data={auditActorData}
              config={{ xKey: 'name', valueKey: 'value', colors: [CHART_COLORS.purple] }}
              title=""
              governanceContext="audit"
              height={160}
              onDrillDown={(info) => onDrill({ title: 'Audit Actor', subtitle: info.label, context: 'audit', rows: [{ label: 'Actor', value: info.label }, { label: 'Entries', value: `${info.payload?.value ?? 0}` }] })}
              onCrossFilter={onCrossFilter}
              crossFilter={crossFilter}
            />
          </div>
          <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
            {auditHealth.recent.map(log => (
              <div key={log.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                <span className="font-mono text-text-muted shrink-0">{String(log.timestamp).slice(0, 16).replace('T', ' ')}</span>
                <span className="font-semibold text-text-primary">{log.actor || 'System'}</span>
                <span className="text-text-muted truncate">{log.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BU × Payment Partner heatmap */}
      <div className="bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-primary" /> Business Unit × Payment Partner Heatmap
          </h3>
          <div className="flex gap-1">
            {(['INCIDENTS', 'BREACHES'] as const).map(m => (
              <button
                key={m}
                onClick={() => setHeatMapMetric(m)}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded transition cursor-pointer ${heatMapMetric === m ? 'bg-accent text-[#fff]' : 'bg-surface-hover text-text-secondary hover:bg-border-subtle'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${partners.length}, minmax(64px, 1fr))` }}>
            <div />
            {partners.map(p => <div key={p} className="text-[10px] font-semibold text-text-muted text-center pb-1 truncate">{p}</div>)}
            {businessUnits.map(bu => (
              <>
                <div key={`label-${bu}`} className="text-[10px] font-medium text-text-secondary pr-2 truncate">{bu}</div>
                {partners.map(p => {
                  const cell = heatmap.find(h => h.bu === bu && h.partner === p);
                  const v = cell?.value ?? 0;
                  return (
                    <button
                      key={`${bu}-${p}`}
                      onClick={() => onDrill({
                        title: `${bu} × ${p}`,
                        subtitle: `${heatMapMetric} heatmap`,
                        context: 'risk',
                        rows: [
                          { label: 'Business Unit', value: bu },
                          { label: 'Payment Partner', value: p },
                          { label: heatMapMetric, value: `${v}` },
                        ],
                      })}
                      className="h-8 rounded-md flex items-center justify-center text-[11px] font-mono font-semibold text-text-primary transition hover:ring-2 hover:ring-accent/40 cursor-pointer"
                      style={{ backgroundColor: heatColor(v) }}
                    >
                      {v > 0 ? v : ''}
                    </button>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
