import { useMemo, useState } from 'react';
import { Download, FileText, Lock, Shield, CheckCircle, XCircle, Search, ChevronDown } from 'lucide-react';
import type { AuditLog } from '../types/app';
import { useApp } from '../context/AppContext';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import { verifyAuditChain } from '../lib/compliance';
import { exportAuditLogsToCsv, exportAuditLogsToPdf } from '../lib/exportUtils';

interface AuditLogsPageProps {
  auditLogs: AuditLog[];
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

/** Convert a snake_case action into a readable title, e.g. REFERENCE_USERS_CREATED -> Reference Users Created. */
function humanizeAction(action: string): string {
  return (action || '')
    .replace(/_+$/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^Kb /, 'KB ')
    .replace(/^Sla /, 'SLA ')
    .replace(/\bRca\b/g, 'RCA')
    .replace(/\bBu\b/g, 'BU')
    .replace(/\bPii\b/g, 'PII')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bMi\b/g, 'MI');
}

/**
 * Parse the details string of an audit log into structured label/value fields.
 * Falls back to a single "Details" field when the format isn't a known one.
 */
function formatAuditDetails(action: string, details: string): { label: string; value: string }[] {
  const d = (details || '').trim();
  if (!d) return [];

  const named = (verb: string, entity: string, pattern: RegExp): { label: string; value: string }[] | null => {
    const m = d.match(pattern);
    if (!m) return null;
    const fields: { label: string; value: string }[] = [{ label: 'Action', value: `${verb} ${humanizeAction(entity)}`.replace(/\s+/g, ' ') }];
    if (m[1]) fields.push({ label: 'Name', value: m[1].trim() });
    if (m[2]) fields.push({ label: 'Email', value: m[2].trim() });
    return fields;
  };

  const customer = named('Created', 'customer', /^Created customer:\s*(.+?)\s*\(([^)]+)\)$/i) ||
                   named('Updated', 'customer', /^Updated customer:\s*(.+?)\s*\(([^)]+)\)$/i) ||
                   named('Deleted', 'customer', /^Deleted customer:\s*(.+?)\s*\(([^)]+)\)$/i);
  if (customer) return customer;

  const m = d.match(/^(Created|Updated|Deleted)\s+([^:]+?):\s*(.+)$/i);
  if (m) {
    return [
      { label: 'Action', value: m[1] },
      { label: 'Item', value: m[2].trim() },
      { label: 'Details', value: m[3].trim() },
    ];
  }

  return [{ label: 'Details', value: d }];
}

type LogGroup = { label: string; logs: AuditLog[] };

function groupLogsByDay(logs: AuditLog[]): LogGroup[] {
  const today = new Date();
  const startOfDay = (ts: number) => {
    const dt = new Date(ts);
    dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  };
  const buckets = new Map<number, AuditLog[]>();
  for (const log of logs) {
    const day = startOfDay(new Date(log.timestamp).getTime());
    const arr = buckets.get(day);
    if (arr) arr.push(log);
    else buckets.set(day, [log]);
  }
  const anchor = (n: number) => startOfDay(today.getTime() - n * 86400000);
  const labelFor = (day: number) => {
    if (day === anchor(0)) return 'Today';
    if (day === anchor(1)) return 'Yesterday';
    return new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([day, group]) => ({ label: labelFor(day), logs: group.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) }));
}

export default function AuditLogsPage({ auditLogs, showToast }: AuditLogsPageProps) {
  const { isLoading } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [chainResult, setChainResult] = useState<{ valid: boolean; brokenIndex: number | null } | null>(null);

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return auditLogs;
    const q = searchQuery.toLowerCase();
    return auditLogs.filter(log =>
      log.actor.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      (log.ticketId && log.ticketId.toLowerCase().includes(q))
    );
  }, [auditLogs, searchQuery]);

  const groupedLogs = useMemo(() => groupLogsByDay(filteredLogs), [filteredLogs]);

  const exportCsv = () => {
    try { exportAuditLogsToCsv(auditLogs); showToast('Audit trail exported as CSV.'); } catch { showToast('Failed to export CSV.', 'error'); }
  };

  const exportPdf = async () => {
    try { await exportAuditLogsToPdf(auditLogs); showToast('Audit log report exported as PDF.'); } catch { showToast('Failed to export PDF.', 'error'); }
  };

  const handleVerifyChain = async () => {
    const result = await verifyAuditChain(auditLogs);
    setChainResult(result);
    if (result.valid) {
      showToast('Audit chain verified: all hashes are intact.', 'success');
    } else {
      showToast(`Chain broken at index ${result.brokenIndex}! Tampering detected.`, 'error');
    }
  };

  return (
    <PageTransition>
      <PageContainer maxWidth="full" className="space-y-6">
        <PageHeader
          title="Compliance & Immutable Audit Logs"
          subtitle="Continuous cryptographic ledger capturing all system perspective changes, PII decrypts, and status mutations"
          breadcrumbs={[{ label: 'Home' }, { label: 'Compliance' }, { label: 'Audit Logs' }]}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" icon={<Shield className="w-3.5 h-3.5" />} onClick={handleVerifyChain}>
                Verify Chain
              </Button>
              <Button variant="primary" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={exportCsv}>
                CSV
              </Button>
              <Button variant="primary" size="sm" icon={<FileText className="w-3.5 h-3.5" />} onClick={exportPdf}>
                PDF
              </Button>
            </div>
          }
        />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by action, details, actor, or ticket ID..."
            aria-label="Search audit logs"
            className="w-full bg-surface-elevated border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring"
          />
        </div>

        {chainResult && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-semibold ${chainResult.valid ? 'bg-success-light border-success/20 text-success-dark' : 'bg-error-light border-error/20 text-error-dark'}`}>
          {chainResult.valid ? <CheckCircle className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-error" />}
          {chainResult.valid ? 'Audit chain verified — all cryptographic hashes are intact and untampered.' : `Chain integrity broken at entry ${chainResult.brokenIndex}! Possible tampering detected.`}
        </div>
      )}

        <div className="bg-surface-elevated rounded-xl">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton variant="table-row" count={6} />
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState icon={<Lock className="w-12 h-12" />} title="No audit logs match your search" message="Try adjusting your search query." />
          ) : (
            <div className="divide-y divide-border">
              {groupedLogs.map(group => (
                <div key={group.label}>
                  <div className="sticky top-0 bg-surface-elevated z-10 px-4 py-2 text-[10px] font-heading font-bold text-text-muted uppercase tracking-wider border-b border-border">
                    {group.label} · {group.logs.length} event{group.logs.length === 1 ? '' : 's'}
                  </div>
                  {group.logs.map((log) => {
                    const fields = formatAuditDetails(log.action, log.details);
                    return (
                      <div key={log.id} className="flex gap-4 p-4 hover:bg-surface-hover transition-colors border-b border-border last:border-b-0">
                        <div className="p-2 bg-primary-light rounded-lg text-primary shrink-0">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <span className="font-semibold text-text-primary text-xs min-w-0 truncate">{humanizeAction(log.action)}</span>
                            <span className="text-caption text-text-muted shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {fields.map((f, i) => (
                              <div key={i} className="flex gap-2 text-caption">
                                <span className="text-text-muted shrink-0 w-12">{f.label}</span>
                                <span className="text-text-secondary break-words min-w-0">{f.value}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-caption text-text-muted mt-1 font-semibold">
                            Actor: <strong className="text-text-primary">{log.actor}</strong> ({log.role}){log.ticketId ? <> • Ticket: <span className="font-mono">{log.ticketId}</span></> : null} • Log ID: <span className="font-mono">{log.id}</span>
                          </p>
                          {(log.hash || log.previousHash) && (
                            <details className="mt-1.5 group">
                              <summary className="cursor-pointer text-caption text-text-muted hover:text-text-primary flex items-center gap-1 list-none">
                                <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                                Cryptographic chain
                              </summary>
                              <div className="mt-1 space-y-0.5 text-caption text-text-muted font-mono break-all">
                                {log.hash && <p>Hash: {log.hash}</p>}
                                {log.previousHash && <p>Prev: {log.previousHash}</p>}
                                {!log.previousHash && <p>Prev: (genesis)</p>}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </PageTransition>
  );
}
