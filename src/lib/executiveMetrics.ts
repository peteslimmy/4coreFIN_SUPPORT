import { TicketStatus, TicketPriority, type TicketRecord, type AuditLog, type MajorIncidentRecord } from '../types/app';

const HOUR = 3600000;
const DAY = 24 * HOUR;

export interface ProviderMetricRow {
  provider: string;
  sla: number;
  active: number;
  closed: number;
  total: number;
  mttr: number;
  reopen: number;
  satisfaction: number;
  status: string;
}

export interface TrendPoint {
  date: string;
  label: string;
  tickets: number;
  resolved: number;
  closed: number;
  breaches: number;
  atRisk: number;
  exposure: number;
}

export interface CompliancePoint {
  date: string;
  label: string;
  total: number;
  breached: number;
  compliance: number;
}

export interface RiskRow {
  id: string;
  customerName: string;
  provider: string;
  businessUnit: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  amount: number;
  ageHours: number;
  slaRemainingHours: number;
  isEscalated: boolean;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface AgentRow {
  agent: string;
  active: number;
  closed: number;
  resolved: number;
  escalated: number;
  total: number;
  slaPercent: number;
  satisfaction: number;
}

export interface IncidentRow {
  incident: MajorIncidentRecord;
  linkedTickets: TicketRecord[];
}

export interface PeriodDeltas {
  createdDelta: number;
  exposureDelta: number;
  breachDelta: number;
  closedDelta: number;
}

export interface ExecutiveInsight {
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  action?: string;
}

export function isAtRisk(t: TicketRecord, now: number, thresholdHours = 24): boolean {
  if (t.status === TicketStatus.CLOSED || t.isEscalated) return false;
  const remaining = new Date(t.slaDeadline).getTime() - now;
  return remaining > 0 && remaining < thresholdHours * HOUR;
}

export function getMttrHours(t: TicketRecord): number | null {
  const resolvedAt = t.rcaDetails?.resolvedAt;
  if (!resolvedAt) return null;
  const start = new Date(t.createdAt).getTime();
  const end = new Date(resolvedAt).getTime();
  if (!isFinite(start) || !isFinite(end) || end < start) return null;
  return (end - start) / HOUR;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function avg(list: number[]): number {
  if (list.length === 0) return 0;
  return list.reduce((s, n) => s + n, 0) / list.length;
}

export function computeSlaPercent(tickets: TicketRecord[], list?: TicketRecord[]): number {
  const source = list || tickets;
  const total = source.length;
  if (total === 0) return 100;
  const escalated = source.filter(t => t.isEscalated).length;
  return (total - escalated) / total * 100;
}

export function computeProviderMetrics(tickets: TicketRecord[], providers: string[]): ProviderMetricRow[] {
  return providers.map(p => {
    const pt = tickets.filter(t => t.provider === p);
    const total = pt.length;
    const active = pt.filter(t => t.status !== TicketStatus.CLOSED).length;
    const closedTickets = pt.filter(t => t.status === TicketStatus.CLOSED);
    const closed = closedTickets.length;
    const escalated = pt.filter(t => t.isEscalated).length;
    const sla = total > 0 ? (total - escalated) / total * 100 : 100;

    const mttrValues = pt.map(getMttrHours).filter((v): v is number => v !== null);
    const mttr = mttrValues.length > 0 ? round1(avg(mttrValues)) : (total > 0 ? round1(2.5 + escalated * 0.8) : 0);

    const rejected = closedTickets.filter(t => t.isEscalated).length;
    const reopen = closed > 0 ? round1(rejected / closed * 100) : 0;

    const rated = pt.filter(t => t.feedbackScore !== null && t.feedbackScore !== undefined);
    const satisfaction = rated.length > 0 ? round1(avg(rated.map(t => t.feedbackScore || 0))) : 0;

    let status = 'Excellent';
    if (sla < 90) status = 'Action Plan';
    else if (sla < 95) status = 'Passing';

    return { provider: p, sla, active, closed, total, mttr, reopen, satisfaction, status };
  });
}

export function computeProviderResolutionQuality(tickets: TicketRecord[], providers: string[]) {
  const closedTickets = tickets.filter(t => t.status === TicketStatus.CLOSED);
  return providers.map(p => {
    const ptClosed = closedTickets.filter(t => t.provider === p);
    const accepted = ptClosed.filter(t => !t.isEscalated).length;
    const rejected = ptClosed.filter(t => t.isEscalated).length;
    const total = ptClosed.length;
    const rate = total > 0 ? accepted / total * 100 : 0;
    return { provider: p, accepted, rejected, total, rate };
  });
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function computeTrendData(tickets: TicketRecord[], days: number, now: number): TrendPoint[] {
  const points: TrendPoint[] = [];
  const todayStart = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = todayStart - i * DAY;
    const dayEnd = dayStart + DAY;
    const dayTickets = tickets.filter(t => {
      const ct = new Date(t.createdAt).getTime();
      return ct >= dayStart && ct < dayEnd;
    });
    const resolved = dayTickets.filter(t => {
      const resolvedAt = t.rcaDetails?.resolvedAt;
      if (resolvedAt) {
        const rt = new Date(resolvedAt).getTime();
        return rt >= dayStart && rt < dayEnd;
      }
      return t.status === TicketStatus.RESOLVED || t.status === TicketStatus.CLOSED;
    });
    const closed = dayTickets.filter(t => t.status === TicketStatus.CLOSED);
    const breaches = dayTickets.filter(t => t.isEscalated);
    const atRisk = tickets.filter(t => isAtRisk(t, dayEnd)).length;
    const exposure = tickets.filter(t => {
      const ct = new Date(t.createdAt).getTime();
      const resolvedAt = t.rcaDetails?.resolvedAt;
      const rt = resolvedAt ? new Date(resolvedAt).getTime() : null;
      const openDuringDay = ct < dayEnd && (rt === null || rt >= dayStart);
      return openDuringDay && t.status !== TicketStatus.CLOSED;
    }).reduce((s, t) => s + t.amount, 0);
    points.push({
      date: new Date(dayStart).toISOString().split('T')[0],
      label: dayLabel(dayStart),
      tickets: dayTickets.length,
      resolved: resolved.length,
      closed: closed.length,
      breaches: breaches.length,
      atRisk,
      exposure,
    });
  }
  return points;
}

export function computeComplianceTrend(tickets: TicketRecord[], days: number, now: number): CompliancePoint[] {
  const points: CompliancePoint[] = [];
  const todayStart = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = todayStart - i * DAY;
    const dayEnd = dayStart + DAY;
    const dayTickets = tickets.filter(t => {
      const ct = new Date(t.createdAt).getTime();
      return ct >= dayStart && ct < dayEnd;
    });
    const breached = dayTickets.filter(t => t.isEscalated).length;
    const total = dayTickets.length;
    const compliance = total > 0 ? (total - breached) / total * 100 : 100;
    points.push({ date: new Date(dayStart).toISOString().split('T')[0], label: dayLabel(dayStart), total, breached, compliance });
  }
  return points;
}

export function computeAtRiskExposure(tickets: TicketRecord[], now: number): number {
  return tickets
    .filter(t => (t.isEscalated || isAtRisk(t, now)) && t.status !== TicketStatus.CLOSED)
    .reduce((s, t) => s + t.amount, 0);
}

export function computeExposureBy(tickets: TicketRecord[], key: 'provider' | 'businessUnit' | 'category' | 'priority') {
  const active = tickets.filter(t => t.status !== TicketStatus.CLOSED);
  const groups = [...new Set(active.map(t => t[key]))];
  return groups.map(g => ({
    name: g,
    value: active.filter(t => t[key] === g).reduce((s, t) => s + t.amount, 0),
    count: active.filter(t => t[key] === g).length,
  })).sort((a, b) => b.value - a.value);
}

export function computeTicketRiskScore(t: TicketRecord, now: number): number {
  let score = 0;
  if (t.isEscalated) score += 50;
  const remainingH = (new Date(t.slaDeadline).getTime() - now) / HOUR;
  if (remainingH <= 0) score += 40;
  else if (remainingH < 24) score += 30;
  else if (remainingH < 48) score += 15;
  const priorityW: Record<TicketPriority, number> = {
    [TicketPriority.CRITICAL]: 30,
    [TicketPriority.HIGH]: 20,
    [TicketPriority.MEDIUM]: 10,
    [TicketPriority.LOW]: 0,
  };
  score += priorityW[t.priority] || 0;
  const ageH = (now - new Date(t.createdAt).getTime()) / HOUR;
  if (ageH > 72) score += 10;
  return Math.min(100, Math.round(score));
}

export function riskLevelFor(score: number): RiskRow['riskLevel'] {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function computeRiskRegister(tickets: TicketRecord[], now: number): RiskRow[] {
  return tickets
    .filter(t => t.status !== TicketStatus.CLOSED)
    .map(t => {
      const riskScore = computeTicketRiskScore(t, now);
      return {
        id: t.id,
        customerName: t.customerName,
        provider: t.provider,
        businessUnit: t.businessUnit,
        category: t.category,
        priority: t.priority,
        status: t.status,
        amount: t.amount,
        ageHours: round1((now - new Date(t.createdAt).getTime()) / HOUR),
        slaRemainingHours: round1((new Date(t.slaDeadline).getTime() - now) / HOUR),
        isEscalated: t.isEscalated,
        riskScore,
        riskLevel: riskLevelFor(riskScore),
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function computeAuditHealth(auditLogs: AuditLog[]) {
  const byDay: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  auditLogs.forEach(log => {
    const day = (log.timestamp || '').slice(0, 10);
    if (day) byDay[day] = (byDay[day] || 0) + 1;
    byAction[log.action] = (byAction[log.action] || 0) + 1;
    byActor[log.actor || 'System'] = (byActor[log.actor || 'System'] || 0) + 1;
  });
  const verified = auditLogs.filter(l => !!l.hash).length;
  const recent = [...auditLogs]
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 8);
  return { total: auditLogs.length, byDay, byAction, byActor, verified, recent };
}

export function computeAgentPerformance(tickets: TicketRecord[]): AgentRow[] {
  const agents = [...new Set(tickets.map(t => t.assignedAgentId).filter(Boolean))];
  return agents.map(a => {
    const at = tickets.filter(t => t.assignedAgentId === a);
    const active = at.filter(t => t.status !== TicketStatus.CLOSED).length;
    const closed = at.filter(t => t.status === TicketStatus.CLOSED).length;
    const resolved = at.filter(t => t.status === TicketStatus.RESOLVED).length;
    const escalated = at.filter(t => t.isEscalated).length;
    const total = at.length;
    const slaPercent = computeSlaPercent(tickets, at);
    const rated = at.filter(t => t.feedbackScore !== null && t.feedbackScore !== undefined);
    const satisfaction = rated.length > 0 ? round1(avg(rated.map(t => t.feedbackScore || 0))) : 0;
    return { agent: a, active, closed, resolved, escalated, total, slaPercent, satisfaction };
  }).sort((a, b) => b.active - a.active);
}

export function computeIncidentImpact(incidents: MajorIncidentRecord[], tickets: TicketRecord[]): IncidentRow[] {
  return incidents.map(incident => ({
    incident,
    linkedTickets: tickets.filter(t => t.majorIncidentId === incident.id),
  }));
}

export function computeCustomerImpact(tickets: TicketRecord[]) {
  const grouped = new Map<string, TicketRecord[]>();
  tickets.forEach(t => {
    const key = t.customerEmail || t.customerName || 'Unknown';
    const list = grouped.get(key) || [];
    list.push(t);
    grouped.set(key, list);
  });
  const rows = [...grouped.entries()].map(([key, list]) => ({
    customer: key,
    count: list.length,
    open: list.filter(t => t.status !== TicketStatus.CLOSED).length,
    closed: list.filter(t => t.status === TicketStatus.CLOSED).length,
    exposure: list.filter(t => t.status !== TicketStatus.CLOSED).reduce((s, t) => s + t.amount, 0),
    lastActive: list.reduce((max, t) => Math.max(max, new Date(t.createdAt).getTime()), 0),
  }));
  return rows.sort((a, b) => b.exposure - a.exposure);
}

export function computeHealthScore(fcr: number, rft: number, sla: number, csatAvg: number) {
  const parts = {
    fcr: Math.round(fcr || 0),
    rft: Math.round(rft || 0),
    sla: Math.round(sla || 0),
    csat: Math.round((csatAvg || 0) * 20),
  };
  const score = Math.round(parts.fcr * 0.25 + parts.rft * 0.25 + parts.sla * 0.25 + parts.csat * 0.25);
  return { score, parts };
}

export function computePeriodDeltas(tickets: TicketRecord[], now: number, periodDays = 7): PeriodDeltas {
  const windowStart = now - periodDays * DAY;
  const prevStart = now - 2 * periodDays * DAY;
  const inWindow = (t: TicketRecord, from: number, to: number) => {
    const ct = new Date(t.createdAt).getTime();
    return ct >= from && ct <= to;
  };
  const prev = tickets.filter(t => inWindow(t, prevStart, windowStart));
  const curr = tickets.filter(t => inWindow(t, windowStart, now));
  const pct = (a: number, b: number) => {
    if (b > 0) return round1((a - b) / b * 100);
    return a > 0 ? 100 : 0;
  };
  return {
    createdDelta: pct(curr.length, prev.length),
    exposureDelta: pct(curr.reduce((s, t) => s + t.amount, 0), prev.reduce((s, t) => s + t.amount, 0)),
    breachDelta: pct(curr.filter(t => t.isEscalated).length, prev.filter(t => t.isEscalated).length),
    closedDelta: pct(curr.filter(t => t.status === TicketStatus.CLOSED).length, prev.filter(t => t.status === TicketStatus.CLOSED).length),
  };
}

export function generateExecutiveInsights(input: {
  tickets: TicketRecord[];
  providers: string[];
  deltas: PeriodDeltas;
}): ExecutiveInsight[] {
  const { tickets, providers, deltas } = input;
  const insights: ExecutiveInsight[] = [];
  const active = tickets.filter(t => t.status !== TicketStatus.CLOSED);
  const breached = tickets.filter(t => t.isEscalated && t.status !== TicketStatus.CLOSED);
  const critical = active.filter(t => t.priority === TicketPriority.CRITICAL);
  const highValue = active.filter(t => t.amount >= 500000);

  if (breached.length > 0) {
    insights.push({
      type: 'error',
      title: 'Active SLA breaches',
      message: `${breached.length} ticket(s) breached SLA across ${[...new Set(breached.map(t => t.provider))].join(', ')}.`,
      action: 'Open risk register',
    });
  }
  if (critical.length > 0) {
    insights.push({
      type: 'error',
      title: 'Critical priority backlog',
      message: `${critical.length} CRITICAL ticket(s) open. Expedited handling required.`,
      action: 'Review risk register',
    });
  }
  const weakProviders = providers
    .map(p => ({ provider: p, sla: computeSlaPercent(tickets, tickets.filter(t => t.provider === p)) }))
    .filter(x => x.sla < 95);
  if (weakProviders.length > 0) {
    insights.push({
      type: 'warning',
      title: 'Provider SLA below target',
      message: `${weakProviders.map(x => `${x.provider} (${x.sla.toFixed(1)}%)`).join(', ')} below the 95% SLA target.`,
      action: 'View provider scorecard',
    });
  }
  if (highValue.length > 0) {
    insights.push({
      type: 'warning',
      title: 'High-value exposure',
      message: `${highValue.length} dispute(s) over ₦500k totaling ₦${highValue.reduce((s, t) => s + t.amount, 0).toLocaleString()} pending resolution.`,
    });
  }
  if (deltas.breachDelta > 0) {
    insights.push({
      type: 'warning',
      title: 'Breach momentum',
      message: `SLA breaches are up ${Math.abs(deltas.breachDelta)}% vs the prior period.`,
    });
  }
  if (deltas.exposureDelta > 0) {
    insights.push({
      type: 'info',
      title: 'Exposure trending up',
      message: `Financial dispute exposure is up ${Math.abs(deltas.exposureDelta)}% vs the prior period.`,
    });
  }
  if (deltas.createdDelta !== 0 || deltas.closedDelta !== 0) {
    insights.push({
      type: 'info',
      title: 'Throughput signal',
      message: `Volume ${deltas.createdDelta >= 0 ? 'up' : 'down'} ${Math.abs(deltas.createdDelta)}% and closures ${deltas.closedDelta >= 0 ? 'up' : 'down'} ${Math.abs(deltas.closedDelta)}% this period.`,
    });
  }
  if (insights.length === 0) {
    insights.push({
      type: 'info',
      title: 'Operations nominal',
      message: 'All metrics within acceptable thresholds this period.',
    });
  }
  return insights;
}

export function buildTrendMatrix(tickets: TicketRecord[], providers: string[], businessUnits: string[], metric: 'INCIDENTS' | 'BREACHES') {
  return businessUnits.flatMap(bu => {
    const buTickets = tickets.filter(t => t.businessUnit === bu);
    return providers.map(p => {
      const pt = buTickets.filter(t => t.provider === p);
      const value = metric === 'BREACHES' ? pt.filter(t => t.isEscalated).length : pt.length;
      return { bu, provider: p, value };
    });
  });
}

export function computePipeline(tickets: TicketRecord[]) {
  return [
    { name: 'Receipt', value: tickets.filter(t => t.status === TicketStatus.RECEIPT).length },
    { name: 'Assigned', value: tickets.filter(t => t.status === TicketStatus.ASSIGNED).length },
    { name: 'Investigate', value: tickets.filter(t => t.status === TicketStatus.INVESTIGATE).length },
    { name: 'Resolved', value: tickets.filter(t => t.status === TicketStatus.RESOLVED).length },
    { name: 'Closed', value: tickets.filter(t => t.status === TicketStatus.CLOSED).length },
  ];
}

export function computeAgingBuckets(tickets: TicketRecord[], now: number) {
  const buckets: Record<string, number> = { '0-24h': 0, '24-48h': 0, '48-72h': 0, '72h+': 0, 'Breached': 0 };
  tickets.filter(t => t.status !== TicketStatus.CLOSED).forEach(t => {
    const ageH = (now - new Date(t.createdAt).getTime()) / HOUR;
    if (t.isEscalated) buckets['Breached']++;
    else if (ageH < 24) buckets['0-24h']++;
    else if (ageH < 48) buckets['24-48h']++;
    else if (ageH < 72) buckets['48-72h']++;
    else buckets['72h+']++;
  });
  return buckets;
}

export function computeCustomerBuRanking(tickets: TicketRecord[], businessUnits: string[]) {
  return businessUnits.map(bu => {
    const bt = tickets.filter(t => t.businessUnit === bu);
    return {
      name: bu,
      count: bt.length,
      open: bt.filter(t => t.status !== TicketStatus.CLOSED).length,
      exposure: bt.filter(t => t.status !== TicketStatus.CLOSED).reduce((s, t) => s + t.amount, 0),
      escalated: bt.filter(t => t.isEscalated).length,
    };
  }).sort((a, b) => b.exposure - a.exposure);
}

export function computeFcrRate(closedTickets: TicketRecord[]): number {
  if (closedTickets.length === 0) return 0;
  const fcr = closedTickets.filter(t => !t.isEscalated && t.feedbackScore !== null && t.feedbackScore !== undefined && t.feedbackScore >= 4);
  return fcr.length / closedTickets.length * 100;
}

export function computeRftRate(closedTickets: TicketRecord[]): number {
  if (closedTickets.length === 0) return 0;
  return closedTickets.filter(t => !t.isEscalated).length / closedTickets.length * 100;
}
