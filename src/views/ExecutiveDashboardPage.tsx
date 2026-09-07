import React, { lazy, Suspense, useState, useMemo, useEffect } from 'react';
import { Download, BarChart2, Users, Layers, Star, ShieldAlert, FileBarChart } from 'lucide-react';
import Tabs from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import GovernanceChart from '../components/ui/GovernanceChart';
import GovernanceDrillDown from '../components/ui/GovernanceDrillDown';
import { CHART_COLORS, CHART_FILLS } from '../lib/chartColors';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import ProgressBar from '../components/ui/ProgressBar';
import { useApp } from '../context/AppContext';
import { TicketStatus, TicketPriority } from '../types/app';
import { exportTicketsToCsv } from '../lib/exportUtils';
import { formatCurrency, formatCurrencyCompact } from '../lib/utils';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import DashboardAlerts from '../components/dashboard/DashboardAlerts';
import KpiGrid from '../components/dashboard/KpiGrid';
import PartnerScorecard from '../components/dashboard/PartnerScorecard';
import QualityTabContent from '../components/dashboard/QualityTabContent';
import {
  computePartnerMetrics,
  computePartnerResolutionQuality,
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
  const { isLoading, tickets, partners, businessUnits, showToast, getScopedTickets, auditLogs, majorIncidents } = useApp();
  const scopedTickets = getScopedTickets();

  const downloadPdf = async () => {
    try {
      const { downloadExecutivePdfReport } = await import('../lib/pdfGenerator');
      await downloadExecutivePdfReport(tickets, partners, businessUnits, auditLogs);
      showToast('PDF report downloaded.', 'success');
    } catch {
      showToast('Failed to download PDF report.', 'error');
    }
  };

  const [drillDown, setDrillDown] = useState<{ title: string; rows: { label: string; value: string }[] } | null>(null);
  const [dashboardTab, setDashboardTab] = useState('performance');
  const [trendPeriod, setTrendPeriod] = useState<'7D' | '30D' | '90D'>('30D');
  const [crossFilter, setCrossFilter] = useState<{ key: string; value: string } | null>(null);
  const [govDrill, setGovDrill] = useState<{ open: boolean; title: string; subtitle?: string; rows: ReturnType<typeof drRows>[]; context: 'sla' | 'audit' | 'risk' | 'policy' | 'general'; metadata?: string[] }>({ open: false, title: '', rows: [], context: 'general' });
  // --- Dynamic Alerts (derived from real data) ---
  const proactiveAlerts = useMemo(() => {
    const alerts: { id: string; type: 'error' | 'warning' | 'info'; message: string }[] = [];
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();

    const breached = scopedTickets.filter(t => t.isEscalated && t.status !== TicketStatus.CLOSED);
    if (breached.length > 0) {
      const byPartner = [...new Set(breached.map(t => t.partner))];
      alerts.push({ id: 'breach', type: 'error', message: `${breached.length} SLA breach(es) active across ${byPartner.join(', ')}. Immediate action required.` });
    }

    const approaching = scopedTickets.filter(t => {
      if (t.status === TicketStatus.CLOSED || t.isEscalated) return false;
      const remaining = new Date(t.slaDeadline).getTime() - now;
      return remaining > 0 && remaining < 2 * 3600000;
    });
    if (approaching.length > 0) {
      alerts.push({ id: 'approach', type: 'warning', message: `${approaching.length} ticket(s) approaching SLA deadline within 2 hours. Payment Partners: ${[...new Set(approaching.map(t => t.partner))].join(', ')}.` });
    }

    const highValue = scopedTickets.filter(t => t.amount >= 500_000 && t.status !== TicketStatus.CLOSED);
    if (highValue.length > 0) {
      const totalValue = highValue.reduce((s, t) => s + t.amount, 0);
      alerts.push({ id: 'highvalue', type: 'warning', message: `${highValue.length} high-value dispute(s) totaling ${formatCurrency(totalValue)} pending resolution.` });
    }

    const critical = scopedTickets.filter(t => t.priority === TicketPriority.CRITICAL && t.status !== TicketStatus.CLOSED);
    if (critical.length > 0) {
      alerts.push({ id: 'critical', type: 'error', message: `${critical.length} CRITICAL priority ticket(s) open. Expedited handling required.` });
    }

    if (alerts.length === 0) {
      alerts.push({ id: 'clear', type: 'info', message: 'All systems operating within normal parameters. No active alerts.' });
    }

    return alerts;
  }, [scopedTickets]);

  // --- Derived Metrics ---
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
    const exposureByPartner = partners.map(p => ({
      partner: p,
      value: activeTickets.filter(t => t.partner === p).reduce((s, t) => s + t.amount, 0)
    })).sort((a, b) => b.value - a.value);

    const partnerMetrics = computePartnerMetrics(scopedTickets, partners);
    const partnerResolutionQuality = computePartnerResolutionQuality(scopedTickets, partners);

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

    const slaRadarData = partners.map(p => {
      const pt = scopedTickets.filter(t => t.partner === p);
      const total = pt.length;
      const escalatedCount = pt.filter(t => t.isEscalated).length;
      const m = partnerMetrics.find(x => x.partner === p);
      return {
        partner: p,
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
    const insights = generateExecutiveInsights({ tickets: scopedTickets, partners, deltas });

    return {
      activeTickets, closedTickets, resolvedTickets, escalated, ratedTickets,
      fcr, rft, agingBuckets, pipeline, totalExposure, atRiskExposure, exposureByPartner,
      partnerMetrics, partnerResolutionQuality, categoryBreakdown,
      agentWorkload, priorityBreakdown, slaRadarData, trendData, complianceTrend,
      healthScore: health.score, healthParts: health.parts, csatAvg,
      riskRegister, auditHealth, incidentImpact, customerImpact, deltas, insights,
    };
  }, [scopedTickets, partners, trendPeriod, auditLogs, majorIncidents]);

  // --- Handlers ---
  const handleExportExcel = () => {
    try {
      const headers = ['Payment Partner', 'SLA%', 'Active Cases', 'MTTR (Hours)', 'Reopen Ratio', 'Satisfaction', 'Status'];
      const rows = metrics.partnerMetrics.map(s => [s.partner, s.sla.toFixed(1), s.active, s.mttr, s.reopen, s.satisfaction, s.status]);
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

  const healthColor = metrics.healthScore >= 90 ? 'text-success' : metrics.healthScore >= 75 ? 'text-warning' : 'text-error';
  const healthDot = metrics.healthScore >= 90 ? 'bg-success' : metrics.healthScore >= 75 ? 'bg-warning' : 'bg-error';

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setLastUpdated(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const formatLastUpdated = () => {
    const diff = Date.now() - lastUpdated;
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(lastUpdated).toLocaleDateString();
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <PageTransition>
        <PageContainer maxWidth="full" className="space-y-5">
          <Skeleton variant="chart" count={1} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Skeleton variant="card" count={4} /></div>
          <Skeleton variant="table-row" count={5} />
        </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageContainer className="space-y-6">
        <PageHeader
          title="Executive Performance Desk"
          subtitle="BPO operational intelligence — SLA, financial exposure, Payment Partner quality, and compliance"
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
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-surface-hover rounded-lg border border-border-subtle">
                <span className="text-caption text-text-muted">Updated</span>
                <span className="text-caption font-mono text-text-secondary">{formatLastUpdated()}</span>
              </div>
            </div>
          }
        />

        {scopedTickets.length === 0 ? (
          <EmptyState icon={<BarChart2 className="w-12 h-12" />} title="No ticket data available" message="Ticket data will appear here once complaints are filed through the portal." />
        ) : (
        <>

        {/* --- Dashboard Tab Navigation --- */}
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

        {/* --- TAB: Performance --- */}
        {dashboardTab === 'performance' && (
          <div role="tabpanel" id="tabpanel-performance" aria-labelledby="tab-performance" className="space-y-6 animate-slide-in">
            <DashboardAlerts alerts={proactiveAlerts} />

            <KpiGrid
              activeTickets={metrics.activeTickets}
              closedTickets={metrics.closedTickets}
              escalated={metrics.escalated}
              ratedTickets={metrics.ratedTickets}
              totalExposure={metrics.totalExposure}
              atRiskExposure={metrics.atRiskExposure}
              exposureByPartner={metrics.exposureByPartner}
              fcr={metrics.fcr}
              rft={metrics.rft}
              deltas={metrics.deltas}
              businessUnits={businessUnits}
              partners={partners}
              scopedTickets={scopedTickets}
              onDrillDown={(title, rows) => setDrillDown({ title, rows })}
            />

            {/* --- Trend Chart + Aging Buckets --- */}
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

            {/* --- Pipeline Funnel + Payment Partner Radar --- */}
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
                  xKey: 'partner',
                  yKeys: [
                    { key: 'sla', name: 'SLA %', color: CHART_COLORS.blue },
                    { key: 'satisfaction', name: 'Satisfaction', color: CHART_COLORS.emerald },
                  ],
                  showGrid: true,
                }}
                title="Payment Partner Performance Radar"
                governanceContext="sla"
                height={208}
                onDrillDown={(info) => {
                  const e = info.payload;
                  const rows: ReturnType<typeof drRows>[] = [];
                  if (e) { rows.push(drRows('Payment Partner', info.label), drRows('SLA %', `${e.sla}%`), drRows('Satisfaction', `${e.satisfaction}/5`)); }
                  setGovDrill({ open: true, title: 'Payment Partner Detail', subtitle: info.label, rows, context: 'sla' });
                }}
                onCrossFilter={setCrossFilter}
                crossFilter={crossFilter}
              />
            </div>
          </div>
        )}

        {/* --- TAB: Operations --- */}
        {dashboardTab === 'operations' && (
          <div role="tabpanel" id="tabpanel-operations" aria-labelledby="tab-operations" className="space-y-6 animate-slide-in">
            <PartnerScorecard data={metrics.partnerMetrics} />

            {/* --- Dispute Value + Resolution Quality --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GovernanceChart
                type="bar"
                data={metrics.exposureByPartner}
                config={{ xKey: 'partner', valueKey: 'value', colors: PIE_COLORS, showGrid: true }}
                title="Dispute Value by Payment Partner"
                governanceContext="risk"
                valueFormatter={(v) => formatCurrencyCompact(v)}
                onDrillDown={(info) => {
                  const e = info.payload;
                  const rows: ReturnType<typeof drRows>[] = [];
                  if (e) { rows.push(drRows('partner', info.label), drRows('Exposure', formatCurrency(e.value))); }
                  setGovDrill({ open: true, title: 'Dispute Exposure', subtitle: info.label, rows, context: 'risk' });
                }}
                onCrossFilter={setCrossFilter}
                crossFilter={crossFilter}
              />
              <GovernanceChart
                type="stacked-bar"
                data={metrics.partnerResolutionQuality}
                config={{
                  xKey: 'partner',
                  yKeys: [
                    { key: 'accepted', name: 'Accepted', color: CHART_COLORS.emerald },
                    { key: 'rejected', name: 'Rejected', color: CHART_COLORS.primary },
                  ],
                  showGrid: true,
                  showLegend: true,
                }}
                title="Resolution Quality by Payment Partner"
                governanceContext="audit"
                onDrillDown={(info) => {
                  const e = info.payload;
                  const rows: ReturnType<typeof drRows>[] = [];
                  if (e) { rows.push(drRows('partner', info.label), drRows('Accepted', e.accepted), drRows('Rejected', e.rejected)); }
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

        {/* --- TAB: Quality --- */}
        {dashboardTab === 'quality' && (
          <div role="tabpanel" id="tabpanel-quality" aria-labelledby="tab-quality" className="space-y-6 animate-slide-in">
            {/* --- Category Breakdown --- */}
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

            <QualityTabContent
              categoryBreakdown={metrics.categoryBreakdown}
              priorityBreakdown={metrics.priorityBreakdown}
              ratedTickets={metrics.ratedTickets}
              activeTicketsCount={metrics.activeTickets.length}
              healthScore={metrics.healthScore}
              healthColor={healthColor}
              fcr={metrics.fcr}
              csatAvg={metrics.csatAvg}
              atRiskExposure={metrics.atRiskExposure}
              insights={metrics.insights}
              onDownloadPdf={downloadPdf}
              onExportCsv={handleExportExcel}
            />
          </div>
        )}

        {/* --- TAB: Risk & Compliance --- */}
        {dashboardTab === 'risk' && (
          <div role="tabpanel" id="tabpanel-risk" aria-labelledby="tab-risk" className="space-y-6 animate-slide-in">
            <Suspense fallback={tabFallback}>
              <RiskComplianceTab
                onDrill={(d) => setGovDrill({ open: true, title: d.title, subtitle: d.subtitle, rows: d.rows, context: d.context, metadata: d.metadata })}
                onCrossFilter={setCrossFilter}
                crossFilter={crossFilter}
              />
            </Suspense>
          </div>
        )}

        {/* --- TAB: Reports --- */}
        {dashboardTab === 'reports' && (
          <div role="tabpanel" id="tabpanel-reports" aria-labelledby="tab-reports" className="space-y-6 animate-slide-in">
            <Suspense fallback={tabFallback}>
              <ReportsTab />
            </Suspense>
          </div>
        )}

        {/* --- Drill-Down Modal --- */}
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

        {/* --- Governance Drill-Down --- */}
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
