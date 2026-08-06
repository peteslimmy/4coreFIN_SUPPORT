import React, { lazy, Suspense, useState, useMemo } from 'react';
import {
  Download, AlertCircle, BarChart2, AlertTriangle, ThumbsUp,
  Search, Sliders, Star, Target, Users,
  Zap, DollarSign, CheckCircle, Layers, BarChart3, ShieldAlert, FileBarChart
} from 'lucide-react';
import KpiCard from '../components/ui/KpiCard';
import Tabs from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import GovernanceChart from '../components/ui/GovernanceChart';
import GovernanceDrillDown from '../components/ui/GovernanceDrillDown';
import { CHART_COLORS, CHART_FILLS } from '../lib/chartColors';
import Table from '../components/ui/Table';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import { useApp } from '../context/AppContext';
import { TicketStatus, TicketPriority } from '../types/app';
import { exportTicketsToCsv } from '../lib/exportUtils';
import { formatCurrency, formatCurrencyCompact } from '../lib/utils';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import ProgressBar from '../components/ui/ProgressBar';
import {
  computeProviderMetrics,
  computeProviderResolutionQuality,
  computeFcrRate,
  computeRftRate,
  computeHealthScore,
  computeTrendData,
  computeComplianceTrend,
  computeAtRiskExposure,
  computePipeline,
  computeAgingBuckets,
  computeRiskRegister,
  computeAgentPerformance,
  computeAuditHealth,
  computeIncidentImpact,
  computeCustomerImpact,
  computePeriodDeltas,
  generateExecutiveInsights,
  computeSlaPercent,
  type ProviderMetricRow,
} from '../lib/executiveMetrics';

const PIE_COLORS = [CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.emerald, CHART_COLORS.purple, CHART_COLORS.primary, CHART_COLORS.cyan];
const AGING_COLORS: Record<string, string> = { '0-24h': CHART_COLORS.emerald, '24-48h': CHART_COLORS.blue, '48-72h': CHART_COLORS.amber, '72h+': CHART_COLORS.primary, 'Breached': CHART_COLORS.primary };
const AGING_COLORS_LIST = Object.values(AGING_COLORS);

const RiskComplianceTab = lazy(() => import('../components/executive/RiskComplianceTab'));
const ReportsTab = lazy(() => import('../components/executive/ReportsTab'));

const tabFallback = (
  <div className="py-16 text-center text-text-muted text-body-sm">Loading&hellip;</div>
);

function drRows(label: string, value: string | number, highlight?: boolean) {
  return { label, value: String(value), highlight };
}

function ExecutiveDashboardPage() {
  const { isLoading, tickets, providers, businessUnits, showToast, getScopedTickets, auditLogs, majorIncidents } = useApp();
  const scopedTickets = getScopedTickets();

  const downloadPdf = async () => {
    try {
      const { downloadExecutivePdfReport } = await import('../lib/pdfGenerator');
      downloadExecutivePdfReport(tickets, providers, businessUnits, auditLogs);
      showToast('PDF report downloaded.', 'success');
    } catch {
      showToast('Failed to download PDF report.', 'error');
    }
  };

  const [scorecardSortField, setScorecardSortField] = useState<string>('provider');
  const [scorecardSortAsc, setScorecardSortAsc] = useState<boolean>(true);
  const [scorecardSearch, setScorecardSearch] = useState<string>('');
  const [drillDown, setDrillDown] = useState<{ title: string; rows: { label: string; value: string }[] } | null>(null);
  const [dashboardTab, setDashboardTab] = useState('performance');
  const [trendPeriod, setTrendPeriod] = useState<'7D' | '30D' | '90D'>('30D');
  const [crossFilter, setCrossFilter] = useState<{ key: string; value: string } | null>(null);
  const [govDrill, setGovDrill] = useState<{ open: boolean; title: string; subtitle?: string; rows: ReturnType<typeof drRows>[]; context: 'sla' | 'audit' | 'risk' | 'policy' | 'general'; metadata?: string[] }>({ open: false, title: '', rows: [], context: 'general' });
  // â”€â”€â”€ Dynamic Alerts (derived from real data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const proactiveAlerts = useMemo(() => {
    const alerts: { id: string; type: 'error' | 'warning' | 'info'; message: string }[] = [];
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();

    // Breached SLA tickets
    const breached = scopedTickets.filter(t => t.isEscalated && t.status !== TicketStatus.CLOSED);
    if (breached.length > 0) {
      const byProvider = [...new Set(breached.map(t => t.provider))];
      alerts.push({ id: 'breach', type: 'error', message: `${breached.length} SLA breach(es) active across ${byProvider.join(', ')}. Immediate action required.` });
    }

    // Tickets approaching SLA (< 2h remaining)
    const approaching = scopedTickets.filter(t => {
      if (t.status === TicketStatus.CLOSED || t.isEscalated) return false;
      const remaining = new Date(t.slaDeadline).getTime() - now;
      return remaining > 0 && remaining < 2 * 3600000;
    });
    if (approaching.length > 0) {
      alerts.push({ id: 'approach', type: 'warning', message: `${approaching.length} ticket(s) approaching SLA deadline within 2 hours. Providers: ${[...new Set(approaching.map(t => t.provider))].join(', ')}.` });
    }

    // High-value disputes
    const highValue = scopedTickets.filter(t => t.amount >= 500_000 && t.status !== TicketStatus.CLOSED);
    if (highValue.length > 0) {
      const totalValue = highValue.reduce((s, t) => s + t.amount, 0);
      alerts.push({ id: 'highvalue', type: 'warning', message: `${highValue.length} high-value dispute(s) totaling ${formatCurrency(totalValue)} pending resolution.` });
    }

    // Critical priority open
    const critical = scopedTickets.filter(t => t.priority === TicketPriority.CRITICAL && t.status !== TicketStatus.CLOSED);
    if (critical.length > 0) {
      alerts.push({ id: 'critical', type: 'error', message: `${critical.length} CRITICAL priority ticket(s) open. Expedited handling required.` });
    }

    // General info if no alerts
    if (alerts.length === 0) {
      alerts.push({ id: 'clear', type: 'info', message: 'All systems operating within normal parameters. No active alerts.' });
    }

    return alerts;
  }, [scopedTickets]);

  // â”€â”€â”€ Derived Metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const metrics = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const activeTickets = scopedTickets.filter(t => t.status !== TicketStatus.CLOSED);
    const closedTickets = scopedTickets.filter(t => t.status === TicketStatus.CLOSED);
    const resolvedTickets = scopedTickets.filter(t => t.status === TicketStatus.RESOLVED);
    const escalated = scopedTickets.filter(t => t.isEscalated);
    const ratedTickets = scopedTickets.filter(t => t.feedbackScore !== null && t.feedbackScore !== undefined);

    const fcr = computeFcrRate(closedTickets);
    const rft = computeRftRate(closedTickets);

    const agingBuckets = computeAgingBuckets(scopedTickets, now);
    const pipeline = computePipeline(scopedTickets);

    const totalExposure = activeTickets.reduce((s, t) => s + t.amount, 0);
    const atRiskExposure = computeAtRiskExposure(scopedTickets, now);
    const exposureByProvider = providers.map(p => ({
      provider: p,
      value: activeTickets.filter(t => t.provider === p).reduce((s, t) => s + t.amount, 0)
    })).sort((a, b) => b.value - a.value);

    const providerMetrics = computeProviderMetrics(scopedTickets, providers);
    const providerResolutionQuality = computeProviderResolutionQuality(scopedTickets, providers);

    const categories = [...new Set(scopedTickets.map(t => t.category))];
    const categoryBreakdown = categories.map(c => ({
      category: c,
      count: scopedTickets.filter(t => t.category === c).length,
      value: scopedTickets.filter(t => t.category === c).reduce((s, t) => s + t.amount, 0)
    })).sort((a, b) => b.count - a.count);

    const agentWorkload = computeAgentPerformance(scopedTickets);

    const priorityBreakdown = Object.values(TicketPriority).map(p => ({
      priority: p,
      count: activeTickets.filter(t => t.priority === p).length
    }));

    const slaRadarData = providers.map(p => {
      const pt = scopedTickets.filter(t => t.provider === p);
      const total = pt.length;
      const escalatedCount = pt.filter(t => t.isEscalated).length;
      const m = providerMetrics.find(x => x.provider === p);
      return {
        provider: p,
        sla: total > 0 ? Math.round((total - escalatedCount) / total * 100) : 100,
        satisfaction: m?.satisfaction || 0,
        mttr: Math.max(0, 100 - (m?.mttr || 0) * 10),
      };
    });

    const trendDays = trendPeriod === '7D' ? 7 : trendPeriod === '30D' ? 30 : 90;
    const trendData = computeTrendData(scopedTickets, trendDays, now);
    const complianceTrend = computeComplianceTrend(scopedTickets, trendDays, now);

    const csatAvg = ratedTickets.length > 0 ? ratedTickets.reduce((s, t) => s + (t.feedbackScore || 0), 0) / ratedTickets.length : 0;
    const health = computeHealthScore(fcr, rft, computeSlaPercent(scopedTickets), csatAvg);

    const riskRegister = computeRiskRegister(scopedTickets, now);
    const auditHealth = computeAuditHealth(auditLogs);
    const incidentImpact = computeIncidentImpact(majorIncidents, scopedTickets);
    const customerImpact = computeCustomerImpact(scopedTickets);
    const deltas = computePeriodDeltas(scopedTickets, now, 7);
    const insights = generateExecutiveInsights({ tickets: scopedTickets, providers, deltas });

    return {
      activeTickets, closedTickets, resolvedTickets, escalated, ratedTickets,
      fcr, rft, agingBuckets, pipeline, totalExposure, atRiskExposure, exposureByProvider,
      providerMetrics, providerResolutionQuality, categoryBreakdown,
      agentWorkload, priorityBreakdown, slaRadarData, trendData, complianceTrend,
      healthScore: health.score, healthParts: health.parts, csatAvg,
      riskRegister, auditHealth, incidentImpact, customerImpact, deltas, insights,
    };
  }, [scopedTickets, providers, trendPeriod, auditLogs, majorIncidents]);

  // â”€â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleExportExcel = () => {
    try {
      const headers = ['Provider', 'SLA%', 'Active Cases', 'MTTR (Hours)', 'Reopen Ratio', 'Satisfaction', 'Status'];
      const rows = metrics.providerMetrics.map(s => [s.provider, s.sla.toFixed(1), s.active, s.mttr, s.reopen, s.satisfaction, s.status]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(r => r.join(',')).join('\n');
      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csvContent));
      link.setAttribute("download", "vendor_scorecard_report.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Vendor scorecard exported as CSV.');
    } catch { showToast('Failed to export CSV.', 'error'); }
  };

  const handleScorecardSort = (field: string) => {
    if (scorecardSortField === field) setScorecardSortAsc(!scorecardSortAsc);
    else { setScorecardSortField(field); setScorecardSortAsc(true); }
  };

  const healthColor = metrics.healthScore >= 90 ? 'text-success' : metrics.healthScore >= 75 ? 'text-warning' : 'text-error';
  const healthDot = metrics.healthScore >= 90 ? 'bg-success' : metrics.healthScore >= 75 ? 'bg-warning' : 'bg-error';

  // ─── Loading State ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <PageTransition>
        <PageContainer maxWidth="xl" className="space-y-5">
          <Skeleton variant="chart" count={1} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Skeleton variant="card" count={4} /></div>
          <Skeleton variant="table-row" count={5} />
        </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageContainer className="space-y-5">
        <PageHeader
          title="Executive Performance Desk"
          subtitle="BPO operational intelligence — SLA, financial exposure, provider quality, and compliance"
          breadcrumbs={[{ label: 'Home' }, { label: 'Executive Performance' }]}
          actions={
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                variant="outlined"
                size="md"
                icon={<Download className="w-4 h-4" />}
                onClick={() => { try { exportTicketsToCsv(tickets); showToast('Tickets exported as CSV.', 'success'); } catch { showToast('Failed to export CSV.', 'error'); } }}
              >
                Export CSV
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Download className="w-4 h-4" />}
                onClick={downloadPdf}
              >
                Export PDF
              </Button>
              <div className="flex items-center gap-3 border-l border-border pl-6">
                <span className={`w-2 h-2 rounded-full ${healthDot} animate-pulse`} />
                <div>
                  <span className="text-overline text-text-muted block">Health Score</span>
                  <span className={`text-h3 font-bold ${healthColor}`}>{metrics.healthScore}%</span>
                </div>
              </div>
            </div>
          }
        />

        {scopedTickets.length === 0 ? (
          <EmptyState icon={<BarChart2 className="w-12 h-12" />} title="No ticket data available" message="Ticket data will appear here once complaints are filed through the portal." />
        ) : (
        <>

        {/* â”€â”€ Dashboard Tab Navigation â”€â”€ */}
        <Tabs
          tabs={[
            { value: 'performance', label: 'Performance', icon: <BarChart2 className="w-4 h-4" /> },
            { value: 'operations', label: 'Operations', icon: <Layers className="w-4 h-4" /> },
            { value: 'quality', label: 'Quality', icon: <Star className="w-4 h-4" /> },
            { value: 'risk', label: 'Risk & Compliance', icon: <ShieldAlert className="w-4 h-4" /> },
            { value: 'reports', label: 'Reports', icon: <FileBarChart className="w-4 h-4" /> },
          ]}
          activeTab={dashboardTab}
          onChange={setDashboardTab}
        />

        {/* â”€â”€â”€ TAB: Performance â”€â”€â”€ */}
        {dashboardTab === 'performance' && (
          <div role="tabpanel" id="tabpanel-performance" aria-labelledby="tab-performance">
        {/* â”€â”€ Proactive Alerts â”€â”€ */}
        {proactiveAlerts.some(a => a.type === 'error' || a.type === 'warning') && (
        <div className="bg-surface-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            {proactiveAlerts.some(a => a.type === 'error') ? (
              <AlertCircle className="w-4 h-4 text-error" />
            ) : (
              <AlertCircle className="w-4 h-4 text-warning" />
            )}
            <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">
              Active Alerts
            </span>
          </div>
          <div className="space-y-2">
            {proactiveAlerts.filter(a => a.type === 'error' || a.type === 'warning').map(a => (
              <div key={a.id} className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${
                a.type === 'error' ? 'bg-error/5 border border-error/15' : 'bg-warning/5 border border-warning/15'
              }`}>
                <span className="flex items-center gap-2.5 text-body-sm text-text-primary">
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    a.type === 'error' ? 'bg-error' : 'bg-warning'
                  }`} />
                  {a.message}
                </span>
                <span className={`text-caption font-semibold shrink-0 ml-3 ${
                  a.type === 'error' ? 'text-error' : 'text-warning'
                }`}>
                  {a.type === 'error' ? 'Critical' : 'Warning'}
                </span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* â”€â”€ Tier 1: Core KPI Row â”€â”€ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <KpiCard
            title="Active Complaints"
            value={metrics.activeTickets.length}
            icon={<BarChart2 className="w-5 h-5" />}
            color="blue"
            animateValue
            trend={{ direction: 'down', label: `Δ ${metrics.deltas.createdDelta >= 0 ? '+' : ''}${metrics.deltas.createdDelta}%` }}
            onClick={() => {
              const byBu = businessUnits.map(bu => ({ label: bu, value: scopedTickets.filter(t => t.businessUnit === bu && t.status !== TicketStatus.CLOSED).length.toString() }));
              setDrillDown({ title: 'Active Complaints by BU', rows: byBu.concat([{ label: 'Total', value: metrics.activeTickets.length.toString() }]) });
            }}
          />
          <KpiCard
            title="FCR Rate"
            value={metrics.fcr}
            icon={<Target className="w-5 h-5" />}
            color="emerald"
            animateValue
            format={(n) => `${n.toFixed(1)}%`}
            trend={{ direction: metrics.fcr > 70 ? 'up' : 'down', label: metrics.fcr > 70 ? 'On Target' : 'Below Target' }}
            onClick={() => setDrillDown({ title: 'First Contact Resolution Detail', rows: [
              { label: 'Resolved Without Escalation', value: metrics.closedTickets.filter(t => !t.isEscalated).length.toString() },
              { label: 'Total Closed', value: metrics.closedTickets.length.toString() },
              { label: 'FCR Rate', value: `${metrics.fcr.toFixed(1)}%` },
            ]})}
          />
          <KpiCard
            title="SLA Breaches"
            value={metrics.escalated.length}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="red"
            animateValue
            trend={{ direction: metrics.escalated.length === 0 ? 'up' : 'down', label: metrics.escalated.length === 0 ? 'Clear' : `Δ ${metrics.deltas.breachDelta >= 0 ? '+' : ''}${metrics.deltas.breachDelta}%` }}
            onClick={() => {
              const byProvider = providers.map(p => ({ label: p, value: scopedTickets.filter(t => t.provider === p && t.isEscalated).length.toString() }));
              setDrillDown({ title: 'SLA Breaches by Provider', rows: byProvider.concat([{ label: 'Total', value: metrics.escalated.length.toString() }]) });
            }}
          />
          <KpiCard
            title="Dispute Exposure"
            value={metrics.totalExposure}
            icon={<DollarSign className="w-5 h-5" />}
            color="amber"
            animateValue
            format={(n) => formatCurrency(n)}
            trend={{ direction: 'neutral', label: `${formatCurrencyCompact(metrics.atRiskExposure)} at risk` }}
            onClick={() => setDrillDown({ title: 'Exposure by Provider', rows: metrics.exposureByProvider.map(e => ({ label: e.provider, value: formatCurrency(e.value) })).concat([{ label: 'Total Exposure', value: formatCurrency(metrics.totalExposure) }]) })}
          />
          <KpiCard
            title="CSAT Score"
            value={metrics.ratedTickets.length > 0 ? `${(metrics.ratedTickets.reduce((s, t) => s + (t.feedbackScore || 0), 0) / metrics.ratedTickets.length).toFixed(2)} / 5` : 'N/A'}
            icon={<ThumbsUp className="w-5 h-5" />}
            color="emerald"
            trend={{ direction: 'up', label: `${metrics.ratedTickets.length} rated` }}
          />
          <KpiCard
            title="RFT Rate"
            value={metrics.rft}
            icon={<CheckCircle className="w-5 h-5" />}
            color="blue"
            animateValue
            format={(n) => `${n.toFixed(1)}%`}
            trend={{ direction: metrics.rft > 80 ? 'up' : 'down', label: metrics.rft > 80 ? 'Healthy' : 'Review' }}
          />
        </div>

        {/* â”€â”€ Trend Chart + Aging Buckets â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <GovernanceChart
              type="area"
              data={metrics.trendData}
              config={{
                xKey: 'label',
                yKeys: [
                  { key: 'tickets', name: 'Total', color: CHART_COLORS.blue, fill: CHART_FILLS.blue },
                  { key: 'resolved', name: 'Resolved', color: CHART_COLORS.emerald, fill: CHART_FILLS.emerald },
                  { key: 'breaches', name: 'Breaches', color: CHART_COLORS.primary, fill: CHART_FILLS.primary },
                ],
                showGrid: true,
              }}
              title="Ticket Trend"
              governanceContext="sla"
              periodOptions={[{ label: '7D', value: '7D' }, { label: '30D', value: '30D' }, { label: '90D', value: '90D' }]}
              periodValue={trendPeriod}
              onPeriodChange={(v) => setTrendPeriod(v as '7D' | '30D' | '90D')}
              onDrillDown={(info) => {
                const e = info.payload;
                const rows: ReturnType<typeof drRows>[] = [];
                if (e) { rows.push(drRows('Date', e.label), drRows('Total Tickets', e.tickets), drRows('Resolved', e.resolved), drRows('Breaches', e.breaches), drRows('At Risk', e.atRisk), drRows('Exposure', formatCurrencyCompact(e.exposure))); }
                setGovDrill({ open: true, title: 'Trend Detail', subtitle: info.label, rows, context: 'sla' });
              }}
              onCrossFilter={setCrossFilter}
              crossFilter={crossFilter}
            />
          </div>

          <GovernanceChart
            type="horizontal-bar"
            data={Object.entries(metrics.agingBuckets).map(([k, v]) => ({ name: k, value: v }))}
            config={{ xKey: 'name', valueKey: 'value', colors: AGING_COLORS_LIST, showGrid: true }}
            title="Aging Buckets"
            governanceContext="risk"
            onDrillDown={(info) => {
              const e = info.payload;
              const rows: ReturnType<typeof drRows>[] = [];
              if (e) { rows.push(drRows('Bucket', info.label), drRows('Count', e.value)); }
              setGovDrill({ open: true, title: 'Aging Detail', subtitle: info.label, rows, context: 'risk' });
            }}
            onCrossFilter={setCrossFilter}
            crossFilter={crossFilter}
          />
        </div>

        {/* â”€â”€ Pipeline Funnel + Provider Radar â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface-elevated rounded-xl shadow-card p-5">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Pipeline Funnel
            </h3>
            <div className="space-y-2">
              {metrics.pipeline.map(stage => {
                const maxVal = Math.max(...metrics.pipeline.map(s => s.value), 1);
                const pct = (stage.value / maxVal) * 100;
                return (
                  <ProgressBar
                    key={stage.name}
                    value={pct}
                    max={100}
                    size="sm"
                    color="primary"
                    showLabel
                    label={`${stage.name} ${stage.value}`}
                    className="w-full"
                  />
                );
              })}
            </div>
          </div>

          <GovernanceChart
            type="radar"
            data={metrics.slaRadarData}
            config={{
              xKey: 'provider',
              yKeys: [
                { key: 'sla', name: 'SLA %', color: CHART_COLORS.blue },
                { key: 'satisfaction', name: 'Satisfaction', color: CHART_COLORS.emerald },
              ],
              showGrid: true,
            }}
            title="Provider Performance Radar"
            governanceContext="sla"
            height={208}
            onDrillDown={(info) => {
              const e = info.payload;
              const rows: ReturnType<typeof drRows>[] = [];
              if (e) { rows.push(drRows('Provider', info.label), drRows('SLA %', `${e.sla}%`), drRows('Satisfaction', `${e.satisfaction}/5`)); }
              setGovDrill({ open: true, title: 'Provider Detail', subtitle: info.label, rows, context: 'sla' });
            }}
            onCrossFilter={setCrossFilter}
            crossFilter={crossFilter}
          />
        </div>
        </div>)}

        {/* â”€â”€â”€ TAB: Operations â”€â”€â”€ */}
        {dashboardTab === 'operations' && (
          <div role="tabpanel" id="tabpanel-operations" aria-labelledby="tab-operations">
        {/* â”€â”€ Provider Scorecard â”€â”€ */}
        <div className="bg-surface-elevated rounded-xl shadow-card p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Provider SLA Scorecard
            </h3>
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-text-muted" />
              <input type="text" placeholder="Filter..." value={scorecardSearch} onChange={(e) => setScorecardSearch(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-body-sm focus:ring-1 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring bg-surface" />
            </div>
          </div>
          <Table
            columns={[
              { key: 'provider', header: 'Provider', sortable: true, render: (s: ProviderMetricRow) => <span className="font-bold text-text-primary">{s.provider}</span> },
              { key: 'sla', header: 'SLA %', sortable: true, align: 'right', render: (s: ProviderMetricRow) => <span className="font-mono text-success-dark">{s.sla.toFixed(1)}%</span> },
              { key: 'active', header: 'Active', sortable: true, align: 'right', render: (s: ProviderMetricRow) => <span className="font-mono">{s.active}</span> },
              { key: 'mttr', header: 'MTTR (h)', sortable: true, align: 'right', render: (s: ProviderMetricRow) => <span className="font-mono">{s.mttr}h</span> },
              { key: 'reopen', header: 'Reopen %', sortable: true, align: 'right', render: (s: ProviderMetricRow) => <span className="font-mono text-text-muted">{s.reopen}%</span> },
              { key: 'satisfaction', header: 'CSAT', sortable: true, align: 'right', render: (s: ProviderMetricRow) => <span className="font-mono">{s.satisfaction} / 5</span> },
              { key: 'status', header: 'Status', align: 'right', render: (s: ProviderMetricRow) => {
                const variantMap: Record<string, 'success' | 'warning' | 'error'> = { 'Excellent': 'success', 'Passing': 'warning' };
                const variant = variantMap[s.status] || 'error';
                return (
                  <span className={`inline-flex items-center gap-1.5 font-bold uppercase text-caption ${
                    variant === 'success' ? 'text-success-dark' : variant === 'warning' ? 'text-warning-dark' : 'text-error-dark'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      variant === 'success' ? 'bg-success' : variant === 'warning' ? 'bg-warning' : 'bg-error'
                    }`} />
                    {s.status}
                  </span>
                );
              }},
            ]}
            data={metrics.providerMetrics.filter(s => s.provider.toLowerCase().includes(scorecardSearch.toLowerCase()))}
            keyExtractor={(s: ProviderMetricRow) => s.provider}
            sortable
            sortField={scorecardSortField}
            sortDirection={scorecardSortAsc ? 'asc' : 'desc'}
            onSort={handleScorecardSort}
          />
        </div>

        {/* â”€â”€ Dispute Value + Resolution Quality â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GovernanceChart
            type="bar"
            data={metrics.exposureByProvider}
            config={{ xKey: 'provider', valueKey: 'value', colors: PIE_COLORS, showGrid: true }}
            title="Dispute Value by Provider"
            governanceContext="risk"
            valueFormatter={(v) => formatCurrencyCompact(v)}
            onDrillDown={(info) => {
              const e = info.payload;
              const rows: ReturnType<typeof drRows>[] = [];
              if (e) { rows.push(drRows('Provider', info.label), drRows('Exposure', formatCurrency(e.value))); }
              setGovDrill({ open: true, title: 'Dispute Exposure', subtitle: info.label, rows, context: 'risk' });
            }}
            onCrossFilter={setCrossFilter}
            crossFilter={crossFilter}
          />
          <GovernanceChart
            type="stacked-bar"
            data={metrics.providerResolutionQuality}
            config={{
              xKey: 'provider',
              yKeys: [
                { key: 'accepted', name: 'Accepted', color: CHART_COLORS.emerald },
                { key: 'rejected', name: 'Rejected', color: CHART_COLORS.primary },
              ],
              showGrid: true,
              showLegend: true,
            }}
            title="Resolution Quality by Provider"
            governanceContext="audit"
            onDrillDown={(info) => {
              const e = info.payload;
              const rows: ReturnType<typeof drRows>[] = [];
              if (e) { rows.push(drRows('Provider', info.label), drRows('Accepted', e.accepted), drRows('Rejected', e.rejected)); }
              setGovDrill({ open: true, title: 'Resolution Quality', subtitle: info.label, rows, context: 'audit' });
            }}
            onCrossFilter={setCrossFilter}
            crossFilter={crossFilter}
          />
        </div>

        <div className="bg-surface-elevated rounded-xl shadow-card p-5">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-info" /> Agent Workload
          </h3>
          <div className="space-y-2">
            {metrics.agentWorkload.slice(0, 8).map(a => {
              const maxActive = Math.max(...metrics.agentWorkload.map(x => x.active), 1);
              return (
                <ProgressBar
                  key={a.agent}
                  value={a.active}
                  max={maxActive}
                  size="sm"
                  color="primary"
                  showLabel
                  label={`${a.agent} ${a.active} / ${a.total}`}
                  className="w-full"
                />
              );
            })}
          </div>
        </div>
          </div>
        )}

        {/* â”€â”€â”€ TAB: Quality â”€â”€â”€ */}
        {dashboardTab === 'quality' && (
          <div role="tabpanel" id="tabpanel-quality" aria-labelledby="tab-quality">
        {/* â”€â”€ Category Breakdown â”€â”€ */}
        <GovernanceChart
          type="pie"
          data={metrics.categoryBreakdown}
          config={{ nameKey: 'category', valueKey: 'count', colors: PIE_COLORS }}
          title="Category Breakdown"
          governanceContext="general"
          onDrillDown={(info) => {
            const e = info.payload;
            const rows: ReturnType<typeof drRows>[] = [];
            if (e) { rows.push(drRows('Category', info.label), drRows('Count', e.count), drRows('Value', formatCurrency(e.value))); }
            setGovDrill({ open: true, title: 'Category Detail', subtitle: info.label, rows, context: 'general' });
          }}
          onCrossFilter={setCrossFilter}
          crossFilter={crossFilter}
        />

        {/* â”€â”€ Priority + Satisfaction â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-surface-elevated rounded-xl shadow-card p-5">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-error" /> Priority Distribution
            </h3>
            <div className="space-y-2">
              {metrics.priorityBreakdown.map(p => {
                const total = metrics.activeTickets.length || 1;
                const pct = (p.count / total) * 100;
                const colorMap: Record<string, 'error' | 'warning' | 'primary' | 'neutral'> = { CRITICAL: 'error', HIGH: 'warning', MEDIUM: 'primary', LOW: 'neutral' };
                return (
                  <ProgressBar
                    key={p.priority}
                    value={pct}
                    max={100}
                    size="sm"
                    color={colorMap[p.priority]}
                    showLabel
                    label={`${p.priority} ${p.count}`}
                    className="w-full"
                  />
                );
              })}
            </div>
          </div>

          <div className="bg-surface-elevated rounded-xl shadow-card p-5">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-warning" /> Satisfaction Distribution
            </h3>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map(star => {
                const count = metrics.ratedTickets.filter(t => Math.round(t.feedbackScore ?? 0) === star).length;
                const pct = metrics.ratedTickets.length > 0 ? (count / metrics.ratedTickets.length * 100) : 0;
                return (
                  <ProgressBar
                    key={star}
                    value={pct}
                    max={100}
                    size="sm"
                    color="warning"
                    showLabel
                    label={`${star}â˜… ${count} (${pct.toFixed(0)}%)`}
                    className="w-full"
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* â”€â”€ Executive Briefing â”€â”€ */}
        <div className="bg-accent/10 rounded-xl p-5">
          <h4 className="text-xs font-semibold text-primary-dark mb-3 flex items-center gap-2">
            <Sliders className="w-4 h-4" /> Executive Briefing
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {metrics.insights.map((ins, i) => (
              <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border ${
                ins.type === 'error' ? 'bg-error/5 border-error/15' : ins.type === 'warning' ? 'bg-warning/5 border-warning/15' : 'bg-surface border-border-subtle'
              }`}>
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${ins.type === 'error' ? 'bg-error animate-pulse' : ins.type === 'warning' ? 'bg-warning' : 'bg-info'}`} />
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-text-primary">{ins.title}</p>
                  <p className="text-[11px] text-text-muted">{ins.message}</p>
                  {ins.action && <span className="text-[10px] font-semibold text-accent">{ins.action}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-body-sm text-text-primary">
            <span>Health Score: <strong className={healthColor}>{metrics.healthScore}%</strong></span>
            <span>FCR: <strong>{metrics.fcr.toFixed(1)}%</strong></span>
            <span>CSAT: <strong>{metrics.csatAvg ? `${metrics.csatAvg.toFixed(2)}/5` : 'N/A'}</strong></span>
            <span>At-Risk Exposure: <strong className="text-warning-dark">{formatCurrency(metrics.atRiskExposure)}</strong></span>
          </div>
          <div className="flex gap-3">
            <Button onClick={downloadPdf} variant="primary" size="sm">Download PDF</Button>
            <Button onClick={handleExportExcel} variant="outlined" size="sm">Export CSV</Button>
          </div>
        </div>
          </div>
        )}

        {/* â”€â”€â”€ TAB: Risk & Compliance â”€â”€â”€ */}
        {dashboardTab === 'risk' && (
          <Suspense fallback={tabFallback}>
            <RiskComplianceTab
              onDrill={(d) => setGovDrill({ open: true, title: d.title, subtitle: d.subtitle, rows: d.rows, context: d.context, metadata: d.metadata })}
              onCrossFilter={setCrossFilter}
              crossFilter={crossFilter}
            />
          </Suspense>
        )}

        {/* â”€â”€â”€ TAB: Reports â”€â”€â”€ */}
        {dashboardTab === 'reports' && (
          <Suspense fallback={tabFallback}>
            <ReportsTab />
          </Suspense>
        )}

        {/* â”€â”€ Drill-Down Modal â”€â”€ (shared across all tabs) */}
        {drillDown && (
          <Modal open={!!drillDown} onClose={() => setDrillDown(null)} title={drillDown.title} size="sm">
            <div className="space-y-2">
              {drillDown.rows.map((r, i) => (
                <div key={i} className={`flex justify-between py-3 px-4 rounded text-body-sm ${i === drillDown.rows.length - 1 ? 'bg-surface font-bold text-text-primary border-t border-border' : 'text-text-secondary'}`}>
                  <span>{r.label}</span>
                  <span className="font-mono">{r.value}</span>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {/* â”€â”€ Governance Drill-Down â”€â”€ */}
        <GovernanceDrillDown
          open={govDrill.open}
          onClose={() => setGovDrill(prev => ({ ...prev, open: false }))}
          title={govDrill.title}
          subtitle={govDrill.subtitle}
          rows={govDrill.rows}
          governanceContext={govDrill.context}
          metadata={govDrill.metadata}
        />
      </>
      )}
      </PageContainer>
    </PageTransition>
  );
}

export default React.memo(ExecutiveDashboardPage);
