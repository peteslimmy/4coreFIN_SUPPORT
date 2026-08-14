import { useCallback, useMemo, type ReactNode } from 'react';
import {
  FileBarChart, Wallet, Handshake, Activity, Radio, FileSearch, Users as UsersIcon,
  Repeat, ShieldAlert, Sparkles, Download, FileText,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Button from '../ui/Button';
import { exportTicketsToCsv } from '../../lib/exportUtils';
import { formatCurrencyCompact } from '../../lib/utils';
import {
  computePartnerMetrics,
  computeExposureBy,  computeRiskRegister,
  computeAuditHealth,
  computeIncidentImpact,
  computeAgentPerformance,
  computeCustomerImpact,
  generateExecutiveInsights,
  computePeriodDeltas,
  computeAtRiskExposure,
  computeFcrRate,
  computeRftRate,
  computeHealthScore,
  computeSlaPercent,
} from '../../lib/executiveMetrics';
import { TicketStatus } from '../../types/app';

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = "data:text/csv;charset=utf-8," + [headers, ...rows].map(r => r.join(',')).join('\n');
  const link = document.createElement("a");
  link.href = encodeURI(csv);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface ReportCard {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  stats: { label: string; value: string }[];
  onExport: () => void;
  onExportPdf?: () => void;
}

export default function ReportsTab() {
  const { tickets, partners, businessUnits, auditLogs, majorIncidents, showToast } = useApp();
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const exportPdf = useCallback(async (msg: string) => {
    try {
      const { downloadExecutivePdfReport } = await import('../../lib/pdfGenerator');
      downloadExecutivePdfReport(tickets, partners, businessUnits, auditLogs);
      showToast(msg, 'success');
    } catch {
      showToast('PDF export failed.', 'error');
    }
  }, [tickets, partners, businessUnits, auditLogs, showToast]);

  const data = useMemo(() => {
    const active = tickets.filter(t => t.status !== TicketStatus.CLOSED);
    const closed = tickets.filter(t => t.status === TicketStatus.CLOSED);
    const resolved = tickets.filter(t => t.status === TicketStatus.RESOLVED);
    const escalated = tickets.filter(t => t.isEscalated);
    const fcr = computeFcrRate(closed);
    const rft = computeRftRate(closed);
    const sla = computeSlaPercent(tickets);
    const rated = tickets.filter(t => t.feedbackScore !== null && t.feedbackScore !== undefined);
    const csat = rated.length > 0 ? rated.reduce((s, t) => s + (t.feedbackScore || 0), 0) / rated.length : 0;
    const partnerMetrics = computePartnerMetrics(tickets, partners);
    const exposureByPartner = computeExposureBy(tickets, 'partner');
    const exposureByBu = computeExposureBy(tickets, 'businessUnit');
    const exposureByCategory = computeExposureBy(tickets, 'category');
    const riskRegister = computeRiskRegister(tickets, now);
    const auditHealth = computeAuditHealth(auditLogs);
    const incidents = computeIncidentImpact(majorIncidents, tickets);
    const agents = computeAgentPerformance(tickets);
    const customers = computeCustomerImpact(tickets);
    const deltas = computePeriodDeltas(tickets, now, 7);
    const atRiskExposure = computeAtRiskExposure(tickets, now);
    const health = computeHealthScore(fcr, rft, sla, csat);
    const insights = generateExecutiveInsights({ tickets, partners, deltas });
    const totalExposure = active.reduce((s, t) => s + t.amount, 0);

    const exposureHeaders = ['Group', 'Exposure', 'Open Tickets'];
    const partnerHeaders = ['Payment Partner', 'SLA %', 'Active', 'Closed', 'MTTR (h)', 'Reopen %', 'CSAT'];
    const riskHeaders = ['Ticket', 'Customer', 'Payment Partner', 'Business Unit', 'Priority', 'Amount', 'Risk Score'];
    const agentHeaders = ['Agent', 'Active', 'Closed', 'Resolved', 'Escalated', 'SLA %', 'CSAT'];
    const customerHeaders = ['Customer', 'Tickets', 'Open', 'Closed', 'Exposure'];

    return {
      active, closed, resolved, escalated, fcr, rft, sla, csat, totalExposure, atRiskExposure, health,
      partnerMetrics, exposureByPartner, exposureByBu, exposureByCategory, riskRegister,
      auditHealth, incidents, agents, customers, deltas, insights,
      exporter: {
        exposure: (key: 'partner' | 'businessUnit' | 'category') => {
          const rows = key === 'partner' ? exposureByPartner : key === 'businessUnit' ? exposureByBu : exposureByCategory;
          downloadCsv(`exposure_by_${key}.csv`, exposureHeaders, rows.map(r => [r.name, r.value, r.count]));
        },
        partners: () => downloadCsv('partner_scorecard.csv', partnerHeaders, partnerMetrics.map(r => [r.partner, r.sla.toFixed(1), r.active, r.closed, r.mttr, r.reopen, r.satisfaction])),
        risk: () => downloadCsv('risk_register.csv', riskHeaders, riskRegister.map(r => [r.id, r.customerName, r.partner, r.businessUnit, r.priority, r.amount, r.riskScore])),
        agents: () => downloadCsv('agent_performance.csv', agentHeaders, agents.map(a => [a.agent, a.active, a.closed, a.resolved, a.escalated, a.slaPercent.toFixed(1), a.satisfaction])),
        customers: () => downloadCsv('customer_impact.csv', customerHeaders, customers.map(c => [c.customer, c.count, c.open, c.closed, c.exposure])),
      },
    };
  }, [tickets, partners, auditLogs, majorIncidents, now]);

  const reports: ReportCard[] = useMemo(() => [
    {
      id: 'sla',
      icon: <FileBarChart className="w-5 h-5" />,
      title: 'Executive SLA Performance Report',
      description: 'Compliance rate, active breaches, FCR/RFT and the composite health score.',
      stats: [
        { label: 'SLA Adherence', value: `${data.sla.toFixed(1)}%` },
        { label: 'Breaches', value: `${data.escalated.length}` },
        { label: 'Health', value: `${data.health.score}%` },
      ],
      onExport: () => { try { exportTicketsToCsv(tickets); showToast('Tickets exported as CSV.', 'success'); } catch { showToast('Export failed.', 'error'); } },
      onExportPdf: () => { exportPdf('PDF report downloaded.'); },
    },
    {
      id: 'exposure',
      icon: <Wallet className="w-5 h-5" />,
      title: 'Financial Exposure Report',
      description: 'Open dispute value split by partner, business unit and category with at-risk exposure.',
      stats: [
        { label: 'Total Exposure', value: formatCurrencyCompact(data.totalExposure) },
        { label: 'At Risk', value: formatCurrencyCompact(data.atRiskExposure) },
        { label: 'Open', value: `${data.active.length}` },
      ],
      onExport: () => { data.exporter.exposure('partner'); showToast('Exposure by partner exported.', 'success'); },
    },
    {
      id: 'vendor',
      icon: <Handshake className="w-5 h-5" />,
      title: 'Payment Partner / Vendor Scorecard',
      description: 'SLA %, MTTR, reopen ratio and CSAT ranked per payment partner.',
      stats: data.partnerMetrics.map(p => ({ label: p.partner, value: `${p.sla.toFixed(0)}%` })),
      onExport: () => { data.exporter.partners(); showToast('Payment Partner scorecard exported.', 'success'); },
    },
    {
      id: 'throughput',
      icon: <Activity className="w-5 h-5" />,
      title: 'Operations Throughput & Velocity',
      description: 'Backlog, pipeline and period momentum (volume, closures, breach trend).',
      stats: [
        { label: 'Backlog', value: `${data.active.length}` },
        { label: 'Resolved Loop', value: `${data.resolved.length}` },
        { label: 'Volume Δ', value: `${data.deltas.createdDelta >= 0 ? '+' : ''}${data.deltas.createdDelta}%` },
      ],
      onExport: () => { downloadCsv('throughput.csv', ['Metric', 'Value'], [['Active', data.active.length], ['Resolved', data.resolved.length], ['Volume Delta %', data.deltas.createdDelta], ['Closure Delta %', data.deltas.closedDelta], ['Breach Delta %', data.deltas.breachDelta]]); showToast('Throughput report exported.', 'success'); },
    },
    {
      id: 'incident',
      icon: <Radio className="w-5 h-5" />,
      title: 'Major Incident Impact Report',
      description: 'Active incidents, linked tickets, severity mix and PIR status.',
      stats: [
        { label: 'Active MI', value: `${majorIncidents.filter(mi => mi.active).length}` },
        { label: 'Linked Tickets', value: `${data.incidents.reduce((s, i) => s + i.linkedTickets.length, 0)}` },
        { label: 'Total MI', value: `${majorIncidents.length}` },
      ],
      onExport: () => { downloadCsv('major_incidents.csv', ['Incident', 'Payment Partner', 'Severity', 'Status', 'Linked Tickets'], data.incidents.map(i => [i.incident.name, i.incident.partner, i.incident.severity, i.incident.status, i.linkedTickets.length])); showToast('Incident report exported.', 'success'); },
    },
    {
      id: 'audit',
      icon: <FileSearch className="w-5 h-5" />,
      title: 'Compliance & Audit Health Report',
      description: 'Audit trail volume, action/actor mix and hash-chain verification status.',
      stats: [
        { label: 'Audit Entries', value: `${data.auditHealth.total}` },
        { label: 'Chained', value: `${data.auditHealth.verified}` },
        { label: 'Actors', value: `${Object.keys(data.auditHealth.byActor).length}` },
      ],
      onExport: () => { downloadCsv('audit_health.csv', ['Action', 'Count'], Object.entries(data.auditHealth.byAction)); showToast('Audit health exported.', 'success'); },
    },
    {
      id: 'agents',
      icon: <UsersIcon className="w-5 h-5" />,
      title: 'Agent Performance Report',
      description: 'Capacity, SLA adherence and resolution quality per support agent.',
      stats: data.agents.slice(0, 3).map(a => ({ label: a.agent, value: `${a.active} active` })),
      onExport: () => { data.exporter.agents(); showToast('Agent performance exported.', 'success'); },
    },
    {
      id: 'customers',
      icon: <Repeat className="w-5 h-5" />,
      title: 'Customer Impact Report',
      description: 'Repeat complainants, top accounts by volume and exposure.',
      stats: data.customers.slice(0, 2).map(c => ({ label: c.customer, value: formatCurrencyCompact(c.exposure) })),
      onExport: () => { data.exporter.customers(); showToast('Customer impact exported.', 'success'); },
    },
    {
      id: 'risk',
      icon: <ShieldAlert className="w-5 h-5" />,
      title: 'Executive Risk Register',
      description: 'Every open ticket at risk with amount, age and SLA remaining.',
      stats: [
        { label: 'At Risk', value: `${data.riskRegister.length}` },
        { label: 'At-Risk ₦', value: formatCurrencyCompact(data.atRiskExposure) },
        { label: 'Critical', value: `${data.riskRegister.filter(r => r.riskLevel === 'critical').length}` },
      ],
      onExport: () => { data.exporter.risk(); showToast('Risk register exported.', 'success'); },
    },
    {
      id: 'briefing',
      icon: <Sparkles className="w-5 h-5" />,
      title: 'Executive Briefing & Insights',
      description: 'Rule-based narrative of risks, partner performance and period momentum.',
      stats: [
        { label: 'Insights', value: `${data.insights.length}` },
        { label: 'Critical Alerts', value: `${data.insights.filter(i => i.type === 'error').length}` },
        { label: 'FCR', value: `${data.fcr.toFixed(1)}%` },
      ],
      onExport: () => { downloadCsv('executive_briefing.csv', ['Type', 'Title', 'Message'], data.insights.map(i => [i.type, i.title, i.message])); showToast('Briefing exported.', 'success'); },
      onExportPdf: () => { exportPdf('PDF report downloaded.'); },
    },
  ], [data, tickets, majorIncidents, showToast, exportPdf]);

  return (
    <div className="space-y-5" role="tabpanel" id="tabpanel-reports" aria-labelledby="tab-reports">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map(report => (
          <div key={report.id} className="bg-surface-elevated rounded-xl border border-border-subtle p-5 shadow-sm hover:shadow-card-hover transition-shadow flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="p-2 rounded-lg bg-primary-light text-primary shrink-0">{report.icon}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text-primary leading-tight">{report.title}</h3>
                <p className="text-[11px] text-text-muted mt-0.5">{report.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {report.stats.map(s => (
                <span key={s.label} className="px-2.5 py-1 rounded-lg bg-surface border border-border-subtle text-[11px]">
                  <span className="text-text-muted mr-1.5">{s.label}:</span>
                  <span className="font-mono font-semibold text-text-primary">{s.value}</span>
                </span>
              ))}
            </div>
            <div className="mt-auto flex gap-2">
              <Button variant="outlined" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={report.onExport}>Export CSV</Button>
              {report.onExportPdf && (
                <Button variant="primary" size="sm" icon={<FileText className="w-3.5 h-3.5" />} onClick={report.onExportPdf}>Export PDF</Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-accent/10 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-primary-dark flex items-center gap-2"><FileText className="w-4 h-4" /> Full Executive Pack</h4>
          <p className="text-body-sm text-text-secondary mt-1">Download the complete multi-page PDF covering SLA, exposure, vendor scorecard, risk and compliance.</p>
        </div>
        <Button variant="primary" size="md" icon={<Download className="w-4 h-4" />} onClick={() => exportPdf('Full executive PDF downloaded.')}>
          Generate Full Pack
        </Button>
      </div>
    </div>
  );
}
