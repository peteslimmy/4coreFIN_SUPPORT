import React, { useState } from 'react';
import { Sparkles, Clock } from 'lucide-react';
import { TicketRecord, TicketStatus, UserRole } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { getTicketStatusStep, TICKET_STATUS_ORDER, TICKET_STATUS_LABELS } from '../../lib/utils';
import { isBuSupportRole } from '../../lib/rbac';
import ProgressWizard from '../../components/ui/ProgressWizard';
import StatusActionPanel from '../../views/ticket-workspace/StatusActionPanel';
import type { TicketActionState } from '../../views/ticket-workspace/StatusActionPanel';
import TransitionBlockers from '../ticket/TransitionBlockers';
import SectionHeader from '../ticket/SectionHeader';

interface InvestigationPanelProps {
  ticket: TicketRecord;
  slaConfig?: {
    slaRules: any[];
    holidays: any[];
    priorityFallbackHours: Record<string, number>;
  };
  onBeginInvestigation: () => void;
  onMarkResolved?: () => void;
  onResolveSubmit: (e: React.FormEvent) => void;
  onResolutionResponse: (accept: boolean) => void;
  onSaveTemplate?: () => void;
  onAiGenerateRca?: () => void;
  showDeclareResolution: boolean;
  setShowDeclareResolution: (value: boolean) => void;
}

export function InvestigationPanel({
  ticket,
  onBeginInvestigation,
  onResolveSubmit,
  onResolutionResponse,
  showDeclareResolution,
  setShowDeclareResolution,
}: InvestigationPanelProps) {
  const {
    currentRole, currentUser,
    showToast, logAuditAction,
  } = useApp();

  const [rcaForm, setRcaForm] = useState({ rootCause: '', contributingFactors: '', correctiveActions: '', preventiveActions: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedbackScore, setFeedbackScore] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isRcaGenerating, setIsRcaGenerating] = useState(false);

  const clearError = (field: string) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const actionState: TicketActionState = React.useMemo(() => {
    const status = ticket.status;
    const role = currentRole;
    if (status === TicketStatus.CLOSED) return { kind: 'terminal' };
    if (status === TicketStatus.RESOLVED && isBuSupportRole(role as UserRole)) return { kind: 'validate-resolution' };
    if (status === TicketStatus.RESOLVED) return { kind: 'readout' };
    if (status === TicketStatus.INVESTIGATE && showDeclareResolution) return { kind: 'rca-form' };
    if (status === TicketStatus.INVESTIGATE) return { kind: 'active-investigation' };
    if (status === TicketStatus.RECEIPT) return { kind: 'receipt' };
    if (role === UserRole.PARTNER || role === UserRole.SUPER_ADMIN) return { kind: 'begin-investigation' };
    return { kind: 'partner-review' };
  }, [ticket.status, currentRole, showDeclareResolution]);

  const handleAiGenerateRcaLocal = async () => {
    setIsRcaGenerating(true);
    setTimeout(() => {
      setRcaForm({ rootCause: 'Payment gateway timeout during settlement batch processing.', contributingFactors: 'Network latency spike; retry queue not configured.', correctiveActions: 'Re-processed transaction; confirmed settlement.', preventiveActions: 'Add automatic retry with exponential backoff; alert if batch > 30s.' });
      setIsRcaGenerating(false);
      showToast('AI RCA draft populated.', 'success');
    }, 1200);
  };

  const handleSaveTemplateLocal = () => {
    const content = [rcaForm.rootCause, rcaForm.contributingFactors, rcaForm.correctiveActions, rcaForm.preventiveActions].join('\n');
    if (!content.trim()) { showToast('Fill in RCA first.', 'error'); return; }
    void logAuditAction(ticket.id, 'KB_TEMPLATE_SAVED', `RCA: ${ticket.category}`);
    showToast('Saved as template.', 'success');
  };

  return (
    <div className="space-y-4">
      <section className="solid-surface rounded-xl p-4">
        <ProgressWizard steps={TICKET_STATUS_ORDER.map(s => ({ label: TICKET_STATUS_LABELS[s] }))} currentStep={getTicketStatusStep(ticket.status)} />
        {ticket.status === TicketStatus.WAITING_CUSTOMER && (
          <p className="mt-2 text-[11px] font-medium text-warning flex items-center justify-center gap-1.5">
            <Clock className="w-3 h-3" /> Waiting for customer response — SLA clock paused
          </p>
        )}
        {ticket.status === TicketStatus.WAITING_PARTNER && (
          <p className="mt-2 text-[11px] font-medium text-warning flex items-center justify-center gap-1.5">
            <Clock className="w-3 h-3" /> Waiting for partner response — SLA clock paused
          </p>
        )}
        {ticket.status === TicketStatus.WAITING_INTERNAL && (
          <p className="mt-2 text-[11px] font-medium text-warning flex items-center justify-center gap-1.5">
            <Clock className="w-3 h-3" /> Waiting for internal team — SLA clock paused
          </p>
        )}
        <TransitionBlockers ticket={ticket} currentRole={currentRole} />
      </section>

      <section className="solid-surface rounded-xl p-4">
        <StatusActionPanel
          state={actionState}
          onBeginInvestigation={onBeginInvestigation}
          onMarkResolved={() => { setShowDeclareResolution(true); void logAuditAction(ticket.id, 'PARTNER_MARKED_RESOLVED', 'Partner marked investigation as resolved.'); }}
          onResolveSubmit={onResolveSubmit}
          onResolutionResponse={onResolutionResponse}
          onAiGenerateRca={handleAiGenerateRcaLocal}
          onSaveTemplate={handleSaveTemplateLocal}
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
      </section>

      {(actionState.kind === 'readout' || actionState.kind === 'terminal') && (ticket.rcaDetails || ticket.rootCause) && (
        <section className="solid-surface rounded-xl p-4">
          <SectionHeader icon={<Sparkles className="w-3 h-3" />} label="Root Cause Analysis" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
            <div className="col-span-2 bg-surface-elevated p-3.5 rounded-lg border border-border">
              <span className="font-semibold text-text-muted text-xs block mb-1">Root Cause</span>
              <p className="text-text-primary leading-relaxed">{ticket.rcaDetails?.rootCause || ticket.rootCause || 'N/A'}</p>
            </div>
            <div className="col-span-2 bg-surface-elevated p-3.5 rounded-lg border border-border">
              <span className="font-semibold text-text-muted text-xs block mb-1">Contributing Factors</span>
              <p className="text-text-primary leading-relaxed">{ticket.rcaDetails?.contributingFactors || 'N/A'}</p>
            </div>
            <div className="bg-surface-elevated p-3.5 rounded-lg border border-border">
              <span className="font-semibold text-text-muted text-xs block mb-1">Corrective Actions</span>
              <p className="text-text-primary leading-relaxed">{ticket.rcaDetails?.correctiveActions || ticket.correctiveAction || 'N/A'}</p>
            </div>
            <div className="bg-surface-elevated p-3.5 rounded-lg border border-border">
              <span className="font-semibold text-text-muted text-xs block mb-1">Preventive Actions</span>
              <p className="text-text-primary leading-relaxed">{ticket.rcaDetails?.preventiveActions || 'N/A'}</p>
            </div>
            <div className="bg-surface-elevated p-3.5 rounded-lg border border-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                <svg className="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <div>
                <span className="font-semibold text-text-muted text-xs block">Owner</span>
                <p className="text-text-primary font-semibold text-xs mt-0.5">{ticket.rcaDetails?.preventiveOwner || 'N/A'}</p>
              </div>
            </div>
            <div className="bg-surface-elevated p-3.5 rounded-lg border border-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                <svg className="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <span className="font-semibold text-text-muted text-xs block">Due Date</span>
                <p className="text-text-primary font-semibold text-xs mt-0.5 font-mono">{ticket.rcaDetails?.preventiveDueDate || 'N/A'}</p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}