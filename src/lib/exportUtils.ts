import type { AuditLog, TicketRecord } from '../types/app';

export function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const headerLine = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
  const dataLines = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
  const csv = [headerLine, ...dataLines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPdf(title: string, headers: string[], rows: string[][], filename?: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(14);
  doc.text(title, 14, y);
  y += 8;

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  y += 6;

  const colWidth = Math.min(40, (pageWidth - 28) / headers.length);

  doc.setFontSize(7);
  doc.setTextColor(255);
  doc.setFillColor(30, 58, 138);
  for (let i = 0; i < headers.length; i++) {
    doc.rect(14 + i * colWidth, y, colWidth, 6, 'F');
    doc.text(headers[i], 14 + i * colWidth + 1, y + 4);
  }
  y += 6;
  doc.setTextColor(50);

  for (const row of rows) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    for (let i = 0; i < row.length; i++) {
      doc.text(String(row[i] || '').substring(0, 30), 14 + i * colWidth + 1, y + 3);
    }
    y += 5;
  }

  doc.save(`${filename || title}-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportTicketsToCsv(tickets: TicketRecord[]) {
  exportCsv('tickets', ['ID', 'Customer', 'Provider', 'Category', 'Status', 'Priority', 'Amount', 'Created', 'SLA Deadline'], tickets.map(t => [
    t.id, t.customerName, t.provider, t.category,
    t.status, t.priority, String(t.amount || ''), new Date(t.createdAt).toLocaleDateString(),
    t.slaDeadline ? new Date(t.slaDeadline).toLocaleDateString() : '',
  ]));
}

export function exportAuditLogsToCsv(logs: AuditLog[]) {
  exportCsv('audit-logs', ['ID', 'Timestamp', 'Ticket', 'Actor', 'Role', 'Action', 'Details'], logs.map(l => [
    l.id, new Date(l.timestamp).toLocaleString(), l.ticketId || '-', l.actor, l.role, l.action, l.details,
  ]));
}

export function exportAuditLogsToPdf(logs: AuditLog[]) {
  exportPdf('Audit Log Report', ['Timestamp', 'Ticket', 'Actor', 'Role', 'Action'], logs.slice(0, 500).map(l => [
    new Date(l.timestamp).toLocaleString(), l.ticketId || '-', l.actor, l.role, l.action,
  ]), 'audit-log-report');
}

export function exportDashboardToPdf(stats: Record<string, unknown>) {
  const headers = Object.keys(stats);
  const rows = [headers.map(h => String(stats[h]))];
  exportPdf('Executive Dashboard Report', headers, rows, 'dashboard-report');
}
