import { useState } from 'react';
import { Download, FileText, Lock, Shield, CheckCircle, XCircle } from 'lucide-react';
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
  searchQuery: string;
}

export default function AuditLogsPage({ auditLogs, showToast, searchQuery }: AuditLogsPageProps) {
  const { isLoading } = useApp();
  const [chainResult, setChainResult] = useState<{ valid: boolean; brokenIndex: number | null } | null>(null);

  const filteredLogs = searchQuery
    ? auditLogs.filter(log => {
        const q = searchQuery.toLowerCase();
        return log.actor.toLowerCase().includes(q) ||
               log.action.toLowerCase().includes(q) ||
               log.details.toLowerCase().includes(q) ||
               (log.ticketId && log.ticketId.toLowerCase().includes(q));
      })
    : auditLogs;

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
              {filteredLogs.map((log) => (
                <div key={log.id} className="flex gap-4 p-4 hover:bg-surface-hover transition-colors">
                  <div className="p-2 bg-primary-light rounded-lg text-primary shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="font-bold text-text-primary text-xs font-mono uppercase tracking-wide min-w-0 truncate">{log.action}</span>
                      <span className="text-caption text-text-muted font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-base text-text-secondary">{log.details}</p>
                    <p className="text-caption text-text-muted mt-1 font-semibold">
                      Actor: <strong className="text-text-primary">{log.actor}</strong> ({log.role}) • Log ID: <span className="font-mono">{log.id}</span>
                    </p>
                    {log.hash && (
                      <p className="text-caption text-text-muted mt-0.5 font-mono break-all">
                        Hash: {log.hash} | Prev: {log.previousHash || '(genesis)'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </PageTransition>
  );
}
