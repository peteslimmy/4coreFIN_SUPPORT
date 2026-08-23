import React from 'react';
import { CheckCircle, AlertTriangle, ClipboardList, Sparkles, UserCheck } from 'lucide-react';

export type TicketActionState =
  | { kind: 'receipt' }
  | { kind: 'begin-investigation' }
  | { kind: 'active-investigation' }
  | { kind: 'rca-form' }
  | { kind: 'validate-resolution' }
  | { kind: 'readout' }
  | { kind: 'terminal' };

export type ReceiptActionState = { kind: 'receipt' };
export type BeginInvestigationActionState = { kind: 'begin-investigation' };
export type ActiveInvestigationActionState = { kind: 'active-investigation' };
export type RcaFormActionState = { kind: 'rca-form' };
export type ValidateResolutionActionState = { kind: 'validate-resolution' };
export type ReadoutActionState = { kind: 'readout' };
export type TerminalActionState = { kind: 'terminal' };

interface StatusActionPanelProps {
  state: TicketActionState;
  onBeginInvestigation: () => void;
  onMarkResolved: () => void;
  onSaveTemplate: () => void;
  onAiGenerateRca: () => void;
  onResolveSubmit: (e: React.FormEvent) => void;
  onResolutionResponse: (accept: boolean) => void;
  rcaForm: { rootCause: string; contributingFactors: string; correctiveActions: string; preventiveActions: string };
  setRcaForm: React.Dispatch<React.SetStateAction<{ rootCause: string; contributingFactors: string; correctiveActions: string; preventiveActions: string }>>;
  formErrors: Record<string, string>;
  clearError: (field: string) => void;
  isRcaGenerating: boolean;
  feedbackScore: number;
  setFeedbackScore: (n: number) => void;
  feedbackComment: string;
  setFeedbackComment: (s: string) => void;
  currentUser: { firstName: string; lastName: string };
}

export default function StatusActionPanel({
  state, onBeginInvestigation, onMarkResolved,
  onSaveTemplate, onAiGenerateRca, onResolveSubmit, onResolutionResponse,
  rcaForm, setRcaForm, formErrors, clearError, isRcaGenerating,
  feedbackScore, setFeedbackScore, feedbackComment, setFeedbackComment,
  currentUser,
}: StatusActionPanelProps) {
  if (state.kind === 'receipt') {
    return (
      <div className="bg-surface-elevated rounded-xl p-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-text-muted" />
          <h4 className="text-body-sm font-semibold text-text-primary">Awaiting Assignment</h4>
        </div>
        <p className="text-xs text-text-muted mt-1 max-w-xl">This ticket is in Receipt and has not been assigned yet. Investigation can begin once it is assigned.</p>
      </div>
    );
  }

  if (state.kind === 'begin-investigation') {
    return (
      <div className="bg-warning-light rounded-xl p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h4 className="text-body-sm font-semibold flex items-center gap-2 text-text-primary"><ClipboardList className="w-5 h-5 text-warning" /> Begin Investigation</h4>
            <p className="text-xs text-text-muted mt-1 max-w-xl">Initiate investigation protocol per standard procedures.</p>
          </div>
          <button onClick={onBeginInvestigation} className="px-5 py-2.5 bg-warning hover:bg-warning-dark text-white font-semibold rounded-lg text-xs transition focus-ring flex items-center gap-1.5 shrink-0">
            <Sparkles className="w-4 h-4" /> Start Investigation
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'active-investigation') {
    return (
      <div className="bg-success-light rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-success pb-3 flex-wrap gap-2">
          <div>
            <h4 className="text-xs font-semibold text-success-dark mb-1">Active Investigation</h4>
            <p className="text-body-sm font-bold text-text-primary">Investigation in progress</p>
          </div>
          <span className="text-[10px] bg-success text-success-dark font-mono font-semibold px-3 py-1 rounded border border-success">RUNNING</span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">Investigation is underway. Mark as resolved when findings are complete to proceed to the resolution declaration.</p>
        <div className="flex justify-end">
          <button onClick={onMarkResolved} className="px-5 py-2.5 bg-success hover:bg-success-dark text-white font-semibold rounded-lg text-xs transition focus-ring flex items-center gap-1.5 shrink-0 cursor-pointer">
            <CheckCircle className="w-4 h-4" /> Resolved
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'rca-form') {
    return (
      <div className="bg-surface-elevated rounded-xl p-6">
        <form onSubmit={onResolveSubmit} className="space-y-4">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h4 className="text-body-sm font-semibold flex items-center gap-2 text-text-primary"><Sparkles className="w-5 h-5 text-primary" /> Declare Resolution (RCA Required)</h4>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onAiGenerateRca} disabled={isRcaGenerating} className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition focus-ring cursor-pointer disabled:opacity-50">
                {isRcaGenerating ? 'Drafting...' : '✨ AI Draft'}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-muted mb-4">Complete the 4-field Root Cause Analysis. All fields permanently logged.</p>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-text-primary mb-1.5">Root Cause <span className="text-error">*</span></label>
              <textarea rows={2} placeholder="Exact technical root cause..." value={rcaForm.rootCause} onChange={e => { setRcaForm(prev => ({ ...prev, rootCause: e.target.value })); clearError('rootCause'); }} className={`w-full bg-surface-elevated border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary ${formErrors.rootCause ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.rootCause} required />
              {formErrors.rootCause && <p className="text-xs text-error mt-1" role="alert">{formErrors.rootCause}</p>}
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-text-primary mb-1.5">Contributing Factors</label>
              <textarea rows={2} placeholder="Contributing factors..." value={rcaForm.contributingFactors} onChange={e => setRcaForm(prev => ({ ...prev, contributingFactors: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-primary mb-1.5">Corrective Actions <span className="text-error">*</span></label>
              <input type="text" placeholder="Immediate steps taken..." value={rcaForm.correctiveActions} onChange={e => { setRcaForm(prev => ({ ...prev, correctiveActions: e.target.value })); clearError('correctiveActions'); }} className={`w-full bg-surface-elevated border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary ${formErrors.correctiveActions ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.correctiveActions} required />
              {formErrors.correctiveActions && <p className="text-xs text-error mt-1" role="alert">{formErrors.correctiveActions}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-primary mb-1.5">Preventive Actions</label>
              <input type="text" placeholder="Long-term prevention..." value={rcaForm.preventiveActions} onChange={e => setRcaForm(prev => ({ ...prev, preventiveActions: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">Owner</label>
              <input type="text" value={`${currentUser.firstName} ${currentUser.lastName}`} readOnly className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-text-muted cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">Declared At</label>
              <input type="text" value={new Date().toLocaleString()} readOnly className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-text-muted cursor-not-allowed" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-semibold transition focus-ring flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Submit
            </button>
            <button type="button" onClick={onSaveTemplate} className="px-3 py-2 bg-surface hover:bg-surface-card text-text-primary rounded-lg text-xs font-semibold transition focus-ring">Save Template</button>
          </div>
        </form>
      </div>
    );
  }

  if (state.kind === 'validate-resolution') {
    return (
      <div className="bg-accent/5 border border-accent/10 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-accent rounded-lg text-white shrink-0"><UserCheck className="w-5 h-5" /></div>
          <div className="flex-1">
            <h4 className="text-body-sm font-bold text-text-primary">Resolution Validation Required</h4>
            <p className="text-xs text-text-muted mt-1 mb-4 leading-relaxed">Partner declared this resolved. Validate and provide feedback.</p>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold text-text-primary">Rating:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} type="button" onClick={() => setFeedbackScore(star)} className={`w-8 h-8 text-xs font-bold rounded-full border transition focus-ring ${feedbackScore === star ? 'bg-primary text-white border-primary' : 'bg-surface-elevated text-text-muted border-border hover:bg-surface-hover'}`}>{star}</button>
                  ))}
                </div>
              </div>
              <input type="text" placeholder="Feedback (required on rejection)..." value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} className="w-full text-xs bg-surface-elevated border border-border rounded-lg p-3 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring text-text-primary" />
              <div className="flex gap-2">
                <button type="button" onClick={() => onResolutionResponse(true)} className="px-5 py-2 bg-success hover:bg-success-dark text-white rounded-lg text-xs font-semibold transition focus-ring">Accept & Close</button>
                <button type="button" onClick={() => onResolutionResponse(false)} className="px-5 py-2 bg-surface-elevated text-error border border-error rounded-lg text-xs font-semibold hover:bg-error-light transition focus-ring">Reject & Reopen</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // readout + terminal — RCA display card
  return null;
}