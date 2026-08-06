import { jsPDF } from 'jspdf';
import { TicketStatus, type TicketRecord, type AuditLog } from '../types/app';
import {
  computeTrendData,
  computeExposureBy,
  computeRiskRegister,
  computeAuditHealth,
  computeSlaPercent,
  computeFcrRate,
  computeRftRate,
  computeHealthScore,
} from './executiveMetrics';

interface GaugeItem {
  label: string;
  value: number;
  color?: number[];
}

function arcPoints(cx: number, cy: number, r: number, startDeg: number, endDeg: number, steps = 48): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const deg = startDeg + ((endDeg - startDeg) * i) / steps;
    const rad = (deg * Math.PI) / 180;
    pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  return pts;
}

function drawBarChart(doc: jsPDF, x: number, y: number, maxWidth: number, rowHeight: number, items: GaugeItem[], formatter: (v: number) => string, labelWidth = 42) {
  const maxValue = Math.max(...items.map(i => i.value), 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  items.forEach((item, idx) => {
    const rowY = y + idx * rowHeight;
    doc.setTextColor(71, 85, 105);
    doc.text(item.label, x, rowY + 3);
    const barW = (item.value / maxValue) * maxWidth;
    doc.setFillColor(241, 245, 249);
    doc.rect(x + labelWidth, rowY - 1, maxWidth, 5, 'F');
    if (item.color) {
      doc.setFillColor(item.color[0], item.color[1], item.color[2]);
      doc.rect(x + labelWidth, rowY - 1, Math.max(barW, 1), 5, 'F');
    } else {
      doc.setFillColor(59, 130, 246);
      doc.rect(x + labelWidth, rowY - 1, Math.max(barW, 1), 5, 'F');
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(formatter(item.value), x + labelWidth + maxWidth + 2, rowY + 3);
    doc.setFont('helvetica', 'normal');
  });
}

function drawTrendSparkline(doc: jsPDF, x: number, y: number, width: number, height: number, values: number[]) {
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(x, y, x + width, y);
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.8);
  values.forEach((v, i) => {
    const bx = x + i * step;
    const bh = (v / max) * (height - 4);
    doc.setFillColor(59, 130, 246);
    doc.rect(bx, y - bh, Math.max(step - 1, 0.8), bh, 'F');
  });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
}

function drawGauge(doc: jsPDF, cx: number, cy: number, r: number, pct: number, score: number) {
  const color = score >= 90 ? [22, 163, 74] : score >= 75 ? [217, 119, 6] : [220, 38, 38];
  const track = arcPoints(cx, cy, r, 225, -45);
  const value = arcPoints(cx, cy, r, 225, 225 + 270 * pct);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(5);
  doc.setLineCap('round');
  for (let i = 0; i < track.length - 1; i++) {
    doc.line(track[i].x, track[i].y, track[i + 1].x, track[i + 1].y);
  }
  doc.setDrawColor(color[0], color[1], color[2]);
  for (let i = 0; i < value.length - 1; i++) {
    doc.line(value[i].x, value[i].y, value[i + 1].x, value[i + 1].y);
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`${score}%`, cx, cy);
}

export function downloadExecutivePdfReport(
  tickets: TicketRecord[],
  providers: string[],
  businessUnits: string[],
  auditLogs?: AuditLog[]
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210;
  const PAGE_H = 297;
  const now = Date.now();
  const activeTickets = tickets.filter(t => t.status !== TicketStatus.CLOSED);
  const closedTickets = tickets.filter(t => t.status === TicketStatus.CLOSED);
  const escalated = tickets.filter(t => t.isEscalated);
  const resolvedLoop = tickets.filter(t => t.status === TicketStatus.RESOLVED);
  const slaPercent = computeSlaPercent(tickets);
  const fcr = computeFcrRate(closedTickets);
  const rft = computeRftRate(closedTickets);
  const rated = tickets.filter(t => t.feedbackScore !== null && t.feedbackScore !== undefined);
  const csatAvg = rated.length > 0 ? rated.reduce((s, t) => s + (t.feedbackScore || 0), 0) / rated.length : 0;
  const health = computeHealthScore(fcr, rft, slaPercent, csatAvg);
  const trendData = computeTrendData(tickets, 14, now);
  const exposureByProvider = computeExposureBy(tickets, 'provider');
  const exposureByBu = computeExposureBy(tickets, 'businessUnit');
  const exposureByCategory = computeExposureBy(tickets, 'category');
  const riskRegister = computeRiskRegister(tickets, now).slice(0, 12);
  const totalExposure = activeTickets.reduce((s, t) => s + t.amount, 0);
  const atRiskExposure = activeTickets
    .filter(t => t.isEscalated || (t.slaDeadline && new Date(t.slaDeadline).getTime() - now < 24 * 3600000))
    .reduce((s, t) => s + t.amount, 0);

  const addHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, PAGE_W, 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('4CoreFin Operations Control Desk', 15, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text('Executive SLA Performance & Compliance Report', 15, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 145, 16);
    doc.text('Version: 2.2 LTS', 145, 22);
  };

  const addFooter = (page: number) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(15, PAGE_H - 16, PAGE_W - 15, PAGE_H - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Confidential - Internal Operations Audit. All timestamps recorded in UTC context.', 15, PAGE_H - 10);
    doc.text(`Page ${page} of 3`, PAGE_W - 15, PAGE_H - 10, { align: 'right' });
  };

  // ── PAGE 1 ──────────────────────────────────────────────────────────────
  addHeader();

  // Core performance boxes
  let startY = 55;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  const boxes: { x: number; label: string; value: string; sub: string; valueColor?: number[] }[] = [
    { x: 15, label: 'TICKET VOLUME', value: `${tickets.length} Total`, sub: `${activeTickets.length} Active / ${closedTickets.length} Closed` },
    { x: 77, label: 'SLA ADHERENCE RATE', value: `${slaPercent.toFixed(2)}%`, sub: `${escalated.length} Breached / ${tickets.length - escalated.length} Compliant`, valueColor: slaPercent >= 90 ? [22, 163, 74] : [220, 38, 38] },
    { x: 139, label: 'COMPLIANCE GATEWAYS', value: `${resolvedLoop.length} Pending Verif`, sub: 'Compliance Standard Loop' },
  ];
  boxes.forEach(b => {
    doc.roundedRect(b.x, startY, 56, 24, 2, 2, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(b.label, b.x + 5, startY + 6);
    doc.setFontSize(12);
    doc.setTextColor(b.valueColor ? b.valueColor[0] : 15, b.valueColor ? b.valueColor[1] : 23, b.valueColor ? b.valueColor[2] : 42);
    doc.text(b.value, b.x + 5, startY + 14);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(b.sub, b.x + 5, startY + 20);
  });

  // Trend sparkline block
  startY += 34;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('14-Day Volume Trend (tickets created per day)', 15, startY);
  drawTrendSparkline(doc, 15, startY + 8, 180, 22, trendData.map(d => d.tickets));
  startY += 38;

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(15, startY, 195, startY);

  // Vendor Partner SLA Scorecard
  startY += 8;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Vendor Partner SLA Compliance Scorecard', 15, startY);
  startY += 5;
  doc.setFillColor(30, 41, 59);
  doc.rect(15, startY, 180, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PROVIDER', 18, startY + 5.5);
  doc.text('TOTAL CASES', 55, startY + 5.5);
  doc.text('SLA ADHERENCE', 85, startY + 5.5);
  doc.text('MTTR (HRS)', 125, startY + 5.5);
  doc.text('AVG SATISFACTION', 155, startY + 5.5);
  startY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  providers.forEach((p, idx) => {
    const providerTickets = tickets.filter(t => t.provider === p);
    const total = providerTickets.length;
    const withinSla = providerTickets.filter(t => !t.isEscalated).length;
    const providerSla = total > 0 ? (withinSla / total) * 100 : 100;
    const activeCases = providerTickets.filter(t => t.status !== TicketStatus.CLOSED).length;
    const mttrValues = providerTickets
      .map(t => (t.rcaDetails?.resolvedAt ? (new Date(t.rcaDetails.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000 : null))
      .filter((v): v is number => v !== null);
    const mttr = mttrValues.length > 0 ? (mttrValues.reduce((s, n) => s + n, 0) / mttrValues.length).toFixed(1) : '—';
    const ratedT = providerTickets.filter(t => t.feedbackScore !== null && t.feedbackScore !== undefined);
    const avgSatisfaction = ratedT.length > 0 ? (ratedT.reduce((s, t) => s + (t.feedbackScore || 0), 0) / ratedT.length).toFixed(1) : '—';

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 8, 'F');
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(p, 18, startY + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${total} (${activeCases} active)`, 55, startY + 5.5);
    if (providerSla >= 95) doc.setTextColor(22, 163, 74);
    else if (providerSla >= 90) doc.setTextColor(217, 119, 6);
    else doc.setTextColor(220, 38, 38);
    doc.text(`${providerSla.toFixed(1)}%`, 85, startY + 5.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${mttr}`, 125, startY + 5.5);
    doc.text(`${avgSatisfaction}`, 155, startY + 5.5);
    doc.setDrawColor(241, 245, 249);
    doc.line(15, startY + 8, 195, startY + 8);
    startY += 8;
  });

  // Business Unit Incident Matrix
  startY += 10;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Business Unit Incident Share & SLA Status', 15, startY);
  startY += 5;
  doc.setFillColor(30, 41, 59);
  doc.rect(15, startY, 180, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BUSINESS UNIT', 18, startY + 5.5);
  doc.text('TOTAL INCIDENTS', 65, startY + 5.5);
  doc.text('ESCALATION COUNT', 110, startY + 5.5);
  doc.text('BU RESOLVED RATE', 150, startY + 5.5);
  startY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  businessUnits.forEach((bu, idx) => {
    const buTickets = tickets.filter(t => t.businessUnit === bu);
    const total = buTickets.length;
    const buEscalated = buTickets.filter(t => t.isEscalated).length;
    const closed = buTickets.filter(t => t.status === TicketStatus.CLOSED).length;
    const resolveRate = total > 0 ? ((closed / total) * 100).toFixed(0) : '100';
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, startY, 180, 8, 'F');
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(bu, 18, startY + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${total} incidents`, 65, startY + 5.5);
    doc.text(`${buEscalated} escalations`, 110, startY + 5.5);
    doc.text(`${resolveRate}% complete`, 150, startY + 5.5);
    doc.setDrawColor(241, 245, 249);
    doc.line(15, startY + 8, 195, startY + 8);
    startY += 8;
  });
  addFooter(1);

  // ── PAGE 2: Financial Exposure & Risk Register ─────────────────────────
  doc.addPage();
  addHeader();
  startY = 52;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Financial Exposure Report', 15, startY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total open exposure: ${totalExposure.toLocaleString()}  ·  At-risk exposure: ${atRiskExposure.toLocaleString()}`, 15, startY + 6);

  const moneyFmt = (v: number) => `₦${Math.round(v).toLocaleString()}`;
  startY += 12;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('By Provider', 15, startY);
  drawBarChart(doc, 15, startY + 4, 120, 7, exposureByProvider.map(e => ({ label: e.name, value: e.value, color: [59, 130, 246] })), moneyFmt);
  startY += 6 + exposureByProvider.length * 7 + 8;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('By Business Unit', 15, startY);
  drawBarChart(doc, 15, startY + 4, 120, 7, exposureByBu.map(e => ({ label: e.name, value: e.value, color: [16, 185, 129] })), moneyFmt);
  startY += 6 + exposureByBu.length * 7 + 8;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('By Category', 15, startY);
  drawBarChart(doc, 15, startY + 4, 120, 7, exposureByCategory.map(e => ({ label: e.name, value: e.value, color: [245, 158, 11] })), moneyFmt);

  // Risk register table on page 2 (below category bars if space, else page 3)
  startY += 6 + exposureByCategory.length * 7 + 10;
  if (startY > PAGE_H - 60) {
    doc.addPage();
    addHeader();
    startY = 52;
  }
  doc.setFillColor(30, 41, 59);
  doc.rect(15, startY - 8, 180, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TOP RISK REGISTER (BY RISK SCORE)', 18, startY - 3);
  startY += 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  riskRegister.forEach((r, idx) => {
    if (startY > PAGE_H - 30) {
      doc.addPage();
      addHeader();
      startY = 52;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
    }
    const bg = idx % 2 === 1 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.rect(15, startY, 180, 6, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(r.id, 18, startY + 4);
    doc.setFont('helvetica', 'normal');
    doc.text(r.customerName, 42, startY + 4);
    doc.setTextColor(100, 116, 139);
    doc.text(r.provider, 80, startY + 4);
    doc.text(r.category, 110, startY + 4);
    doc.setTextColor(r.isEscalated ? 220 : 71, r.isEscalated ? 38 : 85, r.isEscalated ? 38 : 105);
    doc.text(`₦${Math.round(r.amount).toLocaleString()}`, 145, startY + 4);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${r.riskScore}/100`, 175, startY + 4);
    doc.setFont('helvetica', 'normal');
    startY += 6;
  });
  addFooter(2);

  // ── PAGE 3: Compliance & Audit Health ───────────────────────────────────
  doc.addPage();
  addHeader();
  startY = 52;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Compliance, Health & Audit Summary', 15, startY);

  // Health gauge
  const gaugeCy = startY + 48;
  drawGauge(doc, 50, gaugeCy, 34, health.score / 100, health.score);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Operational Health Score', 50, gaugeCy + 42, { align: 'center' });

  // Health breakdown
  doc.setFontSize(8);
  const healthRows = [
    ['FCR', `${health.parts.fcr}%`],
    ['RFT', `${health.parts.rft}%`],
    ['SLA Adherence', `${health.parts.sla}%`],
    ['CSAT (scaled)', `${health.parts.csat}%`],
    ['Overall', `${health.score}%`],
  ];
  healthRows.forEach((row, idx) => {
    const y = startY + 6 + idx * 9;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(row[0], 100, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(idx === healthRows.length - 1 ? 22 : 71, idx === healthRows.length - 1 ? 163 : 85, idx === healthRows.length - 1 ? 74 : 105);
    doc.text(row[1], 130, y);
  });

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(15, gaugeCy + 48, 195, gaugeCy + 48);

  startY = gaugeCy + 54;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Audit Trail & Compliance Health', 15, startY);

  if (auditLogs && auditLogs.length > 0) {
    const audit = computeAuditHealth(auditLogs);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Audit entries: ${audit.total}   ·   Hash-chained entries: ${audit.verified}   ·   Unique actors: ${Object.keys(audit.byActor).length}`, 15, startY + 6);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Actions breakdown', 15, startY + 14);
    drawBarChart(doc, 15, startY + 18, 120, 7, Object.entries(audit.byAction).map(([name, value]) => ({ label: name, value: value as number, color: [139, 92, 246] })), (v) => `${v}`);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Audit log data not provided in this export.', 15, startY + 6);
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(15, PAGE_H - 16, PAGE_W - 15, PAGE_H - 16);
  addFooter(3);

  doc.save(`4CoreFin-Executive-Report-${new Date().toISOString().split('T')[0]}.pdf`);
}
