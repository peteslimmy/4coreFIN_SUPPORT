import React, { useState, useMemo } from 'react';
import { Info, Clock } from 'lucide-react';
import { TicketStatus, UserRole, TicketPriority } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { getTicketStatusStep, TICKET_STATUS_ORDER, TICKET_STATUS_LABELS } from '../../lib/utils';
import { isBuSupportRole } from '../../lib/rbac';
import { resolveSlaDuration, type SlaSource } from '../../lib/slaCalculator';
import ProgressWizard from '../../components/ui/ProgressWizard';
import SlaCountdown from './SlaCountdown';
import StatusActionPanel from './StatusActionPanel';
import type { TicketActionState } from './StatusActionPanel';
import {
  PriorityBadge,
  TransitionBlockers,
  SlaBreachBanner,
  SectionHeader,
  TicketMetadata,
  RcaReadout,
  DetailTabs,
  EvidenceTab,
} from '../../components/ticket';

/* ─── minimal interface so callers know the surface ─── */
interface DetailViewHandle {
  onArchive: (id: string) => void;
  onMerge: () => void;
  onEscalate: () => void;
  onDeclareMajorIncident: () => void;
  onBeginInvestigation: () => void;
  onResolve: (e: React.FormEvent) => Promise<void>;
  onResolutionResponse: (accept: boolean) => Promise<void>;
  onSaveTemplate: () => void;
  onAiGenerateRca: () => Promise<void>;
  showDeclareResolution: boolean;
  setShowDeclareResolution: (value: boolean) => void;
}

export type { DetailViewHandle };

/* ------------------------------------------------------------------ */
/*                        TICKET DETAIL VIEW                          */
/* ------------------------------------------------------------------ */
export default function TicketDetailView({
  activeTicket,
  onArchive,
  onMerge,
  onEscalate,
  onDeclareMajorIncident: _onDeclareMajorIncident,
  onBeginInvestigation,
  onResolve,
  onResolutionResponse,
  showDeclareResolution,
  setShowDeclareResolution,
}: DetailViewHandle & {
  activeTicket: { id: string; status: string; priority: string; isEscalated: boolean; duplicateOf?: string; assignedAgentId?: string; partner: string; watchers?: string[]; slaDeadline: string; category: string; customerName: string; transactionId?: string; amount?: number; createdAt?: string; customFields?: Record<string, unknown>; description: string; rootCause?: string; rcaDetails?: unknown };
}) {
  const {
    currentRole, currentUser, tickets, setTickets,
    setKbArticles, buFormConfigs, showToast, logAuditAction, slaRules, evidence,
  } = useApp();

  /* ── local state ── */
  const [rcaForm, setRcaForm] = useState({ rootCause: '', contributingFactors: '', correctiveActions: '', preventiveActions: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedbackScore, setFeedbackScore] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isRcaGenerating, setIsRcaGenerating] = useState(false);
  const [detailTab, setDetailTab] = useState('activity');

  const clearError = (field: string) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  /* ── SLA source ── */
  const slaSource: SlaSource = resolveSlaDuration(
    activeTicket.category,
    (activeTicket.priority as TicketPriority) || TicketPriority.HIGH,
    slaRules,
  ).source;

  /* ── derived action state ── */
  const actionState: TicketActionState = useMemo(() => {
    const status = activeTicket.status;
    const role = currentRole;
    if (status === TicketStatus.CLOSED) return { kind: 'terminal' };
    if (status === TicketStatus.RESOLVED && isBuSupportRole(role as UserRole)) return { kind: 'validate-resolution' };
    if (status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED) return { kind: 'readout' };
    if (status === TicketStatus.INVESTIGATE && showDeclareResolution) return { kind: 'rca-form' };
    if (status === TicketStatus.INVESTIGATE) return { kind: 'active-investigation' };
    if (status === TicketStatus.RECEIPT) return { kind: 'receipt' };
    if (role === UserRole.PARTNER || role === UserRole.SUPER_ADMIN) return { kind: 'begin-investigation' };
    return { kind: 'partner-review' };
  }, [activeTicket.status, currentRole, showDeclareResolution]);

  /* ── watch toggle ── */
  const isWatching = (activeTicket.watchers || []).includes(currentUser.email);
  const handleToggleWatch = () => {
    const updated = tickets.map(t => {
      if (t.id !== activeTicket.id) return t;
      const list = t.watchers || [];
      return { ...t, watchers: isWatching ? list.filter(e => e.toLowerCase() !== currentUser.email.toLowerCase()) : [...list, currentUser.email] };
    });
    setTickets(updated);
    showToast(isWatching ? 'Unwatched.' : 'Now watching.', 'success');
    void logAuditAction(activeTicket.id, isWatching ? 'TICKET_UNWATCHED_SELF' : 'TICKET_WATCHED_SELF', `${currentUser.firstName} ${currentUser.lastName} ${isWatching ? 'UNWATCHED' : 'WATCHING'}`);
  };

  /* ── action bar items (role-gated) ── */
  const showEscalate = currentRole === UserRole.BU_SUPPORT;
  const showMerge = currentRole === UserRole.BU_SUPPORT;
  const showArchive = currentRole === UserRole.BU_SUPPORT || currentRole === UserRole.SUPER_ADMIN || currentRole === UserRole.EXECUTIVE;

  /* ── RCA form helpers ── */
  const handleAiGenerateRca = async () => {
    setIsRcaGenerating(true);
    setTimeout(() => {
      setRcaForm({ rootCause: 'Payment gateway timeout during settlement batch processing.', contributingFactors: 'Network latency spike; retry queue not configured.', correctiveActions: 'Re-processed transaction; confirmed settlement.', preventiveActions: 'Add automatic retry with exponential backoff; alert if batch > 30s.' });
      setIsRcaGenerating(false);
      showToast('AI RCA draft populated.', 'success');
    }, 1200);
  };

  const handleSaveTemplate = () => {
    const content = [rcaForm.rootCause, rcaForm.contributingFactors, rcaForm.correctiveActions, rcaForm.preventiveActions].join('\n');
    if (!content.trim()) { showToast('Fill in RCA first.', 'error'); return; }
    const newKb = { id: 'kb-' + Date.now(), title: `RCA: ${activeTicket.category}`, category: 'Resolution' as const, partner: activeTicket.partner, content, tags: ['rca-template', activeTicket.category, activeTicket.partner], lastUpdated: new Date().toISOString().split('T')[0] };
    setKbArticles(prev => [...prev, newKb]);
    void logAuditAction(activeTicket.id, 'KB_TEMPLATE_SAVED', newKb.title);
    showToast('Saved as template.', 'success');
  };

  const handleResolutionResponse = async (accept: boolean) => {
    // Delegate to the workspace-level handler passed via props
    onResolutionResponse(accept);
  };

  /* ──────────────────────────────────────────────────── */
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* ── HEADER ── */}
      <header className="bg-surface-elevated border-b border-border sticky top-0 z-10">
        <div className="px-4 lg:px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-overline shrink-0">Ticket ID</p>
            <span className="font-numeric font-bold text-[10px] text-text-primary tracking-tight">{activeTicket.id}</span>
            <PriorityBadge priority={activeTicket.priority} />
            {activeTicket.isEscalated && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-error text-[#fff] rounded-full text-[10px] font-semibold uppercase tracking-wider">Escalated</span>
            )}
            {activeTicket.duplicateOf && (
              <span className="px-2 py-0.5 bg-accent/15 text-accent-light rounded-full text-[10px] font-semibold uppercase tracking-wider" title={`Duplicate of ${activeTicket.duplicateOf}`}>
                Dup of {activeTicket.duplicateOf}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-text-muted min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <span className="truncate">
                Owner: <strong className="font-semibold text-text-primary">{activeTicket.assignedAgentId ? activeTicket.assignedAgentId.replace(/ Team\s*$/i, '') : activeTicket.partner}</strong>
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={handleToggleWatch} className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition focus-ring flex items-center gap-1.5 cursor-pointer ${isWatching ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}`}>
                {isWatching ? '★ Watching' : '☆ Watch'}
              </button>
              {showEscalate && (
                <button type="button" onClick={onEscalate} className="px-2.5 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring flex items-center gap-1">Escalate</button>
              )}
              {showMerge && (
                <button type="button" onClick={onMerge} className="px-2.5 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring hidden sm:flex items-center gap-1">Merge</button>
              )}
              {showArchive && (
                <button type="button" onClick={() => onArchive(activeTicket.id)} className="px-2.5 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring">Archive</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-px bg-border hidden sm:block" />
              <SlaCountdown deadline={activeTicket.slaDeadline} />
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${slaSource === 'rule' ? 'bg-primary-light/50 text-primary border-primary/25' : 'bg-warning-light text-warning border-warning/25'}`} title={slaSource === 'rule' ? 'Deadline set by a configured SLA category rule' : 'No category rule matched; using the priority fallback SLA'}>
                {slaSource === 'rule' ? 'Rule' : 'Default'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── PROGRESS WIZARD ── */}
      <div className="bg-surface-elevated border-b border-border py-3 px-6 lg:px-8 shrink-0">
        <div className="max-w-2xl mx-auto">
          <ProgressWizard steps={TICKET_STATUS_ORDER.map(s => ({ label: TICKET_STATUS_LABELS[s] }))} currentStep={getTicketStatusStep(activeTicket.status)} />
          {activeTicket.status === TicketStatus.WAITING_CUSTOMER && (
            <p className="mt-2 text-[11px] font-medium text-warning dark:text-warning flex items-center justify-center gap-1.5">
              <Clock className="w-3 h-3" /> Waiting for customer response — SLA clock paused
            </p>
          )}
          {activeTicket.status === TicketStatus.WAITING_PARTNER && (
            <p className="mt-2 text-[11px] font-medium text-warning dark:text-warning flex items-center justify-center gap-1.5">
              <Clock className="w-3 h-3" /> Waiting for partner response — SLA clock paused
            </p>
          )}
          {activeTicket.status === TicketStatus.WAITING_INTERNAL && (
            <p className="mt-2 text-[11px] font-medium text-warning dark:text-warning flex items-center justify-center gap-1.5">
              <Clock className="w-3 h-3" /> Waiting for internal team — SLA clock paused
            </p>
          )}
          <TransitionBlockers ticket={activeTicket} currentRole={currentRole} />
        </div>
      </div>

      {/* ── TICKET INFO ── */}
      <div className="px-5 pt-5 shrink-0">
        <div className="bg-surface-card rounded-xl shadow-card overflow-hidden">
          <SlaBreachBanner ticket={activeTicket} />
          <div className="p-5">
            <SectionHeader icon={<Info className="w-3 h-3" />} label="Ticket Information" />
            <TicketMetadata ticket={activeTicket} buFormConfigs={buFormConfigs} />
          </div>
        </div>
      </div>

      {/* ── ACTION PANEL ── */}
      <div className="px-5 mt-5">
        <StatusActionPanel
          state={actionState}
          onBeginInvestigation={onBeginInvestigation}
          onMarkResolved={() => { setShowDeclareResolution(true); void logAuditAction(activeTicket.id, 'PARTNER_MARKED_RESOLVED', 'Partner marked investigation as resolved.'); }}
          onResolveSubmit={onResolve}
          onResolutionResponse={handleResolutionResponse}
          onAiGenerateRca={handleAiGenerateRca}
          onSaveTemplate={handleSaveTemplate}
          rcaForm={rcaForm}
          setRcaForm={setRcaForm}
          formErrors={formErrors}
          clearError={clearError}
          isRcaGenerating={isRcaGenerating}
          feedbackScore={feedbackScore}
          setFeedbackScore={setFeedbackScore}
          feedbackComment={feedbackComment}
          setFeedbackComment={setFeedbackComment}
          currentUser={currentUser}
        />
      </div>

      {/* ── RCA READOUT ── */}
      {(actionState.kind === 'readout' || actionState.kind === 'terminal') && (activeTicket.rcaDetails || activeTicket.rootCause) && (
        <div className="px-5 mt-5">
          <RcaReadout ticket={activeTicket} />
        </div>
      )}

      {/* ── DETAIL TABS ── */}
      <div className="mt-5">
        <div className="bg-surface-card rounded-xl shadow-card px-5 pt-4">
          <DetailTabs
            active={detailTab}
            onChange={setDetailTab}
            tabs={[
              { value: 'activity', label: 'Activity', icon: <Info className="w-3.5 h-3.5" /> },
              { value: 'intelligence', label: 'Intelligence', icon: <Info className="w-3.5 h-3.5" /> },
              { value: 'watchers', label: 'Watchers', icon: <Info className="w-3.5 h-3.5" /> },
              { value: 'files', label: 'Files', icon: <Info className="w-3.5 h-3.5" /> },
            ]}
          />
          <div className="py-4">
            {detailTab === 'activity' && (
              <p className="text-sm text-text-muted p-4">Activity tab — now owned by ActivityTab (context consumer, see Phase 3b expansion).</p>
            )}
            {detailTab === 'intelligence' && (
              <p className="text-sm text-text-muted p-4">Intelligence tab — duplicate frequency + pattern analysis (moved from right panel).</p>
            )}
            {detailTab === 'watchers' && (
              <p className="text-sm text-text-muted p-4">Watchers tab — watcher list + bulk notify (moved from right panel).</p>
            )}
            {detailTab === 'files' && (
              <EvidenceTab ticketId={activeTicket.id} evidence={evidence.filter(e => e.ticketId === activeTicket.id)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
