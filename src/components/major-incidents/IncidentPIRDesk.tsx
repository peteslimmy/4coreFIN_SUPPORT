import { FileText } from 'lucide-react';
import type { MajorIncidentRecord } from '../../types/app';

interface PirFormState {
  rootCauseSummary: string;
  timelineSummary: string;
  impactSummary: string;
  preventiveOwner: string;
  preventiveDueDate: string;
}

interface IncidentPIRDeskProps {
  incident: MajorIncidentRecord;
  pirFormState: PirFormState;
  pirFormErrors: Record<string, string>;
  onPirFormChange: (state: PirFormState) => void;
  onPirFormErrorClear: (field: string) => void;
  onSaveDraft: (miId: string) => void;
  onFinalizeAndClose: () => void;
}

export default function IncidentPIRDesk({ incident, pirFormState, pirFormErrors, onPirFormChange, onPirFormErrorClear, onSaveDraft, onFinalizeAndClose }: IncidentPIRDeskProps) {
  const pir = incident.pir;

  return (
    <div className="bg-surface-elevated rounded-xl shadow-card p-5 space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-info" aria-hidden="true" /> PIR Documentation Desk
          </h4>
        </div>
        <p className="text-caption text-text-secondary mt-2">Review technical findings and draft the mandatory Post-Incident Review (PIR). The incident must be RESOLVED before it can be finalized and closed.</p>
      </div>

      {pir && !pir.draft ? (
        <div className="bg-gradient-to-br from-success-light to-accent-light/20 border border-success rounded-lg p-4 space-y-3 text-xs flex-1 overflow-y-auto mt-3 border-success/50">
          <div className="flex items-center justify-between text-success-dark font-bold">
            <span>✓ PIR Finalized — Ready for Closure</span>
          </div>
          <div className="space-y-2">
            <div><span className="font-bold text-text-secondary text-overline uppercase">Technical Root Cause Summary:</span><p className="text-text-primary font-medium">{pir.rootCauseSummary}</p></div>
            <div><span className="font-bold text-text-secondary text-overline uppercase">Impact Assessment:</span><p className="text-text-primary font-medium">{pir.impactSummary}</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-overline">
              <div className="bg-surface-elevated p-1.5 rounded border border-border-subtle"><span className="font-bold text-text-muted block uppercase font-bold">Preventive Owner</span><span className="font-bold text-text-primary">{pir.preventiveOwner}</span></div>
              <div className="bg-surface-elevated p-1.5 rounded border border-border-subtle"><span className="font-bold text-text-muted block uppercase font-bold">Due Date</span><span className="font-mono text-text-primary">{pir.preventiveDueDate}</span></div>
            </div>
          </div>
          <p className="text-overline text-text-muted text-right pt-2 border-t border-border">Signed: {pir.lastUpdatedBy} on {new Date(pir.lastUpdated).toLocaleDateString()}</p>
        </div>
      ) : (
        <div className="space-y-3.5 flex-1 overflow-y-auto mt-3 pr-1 text-xs">
          {pir && pir.draft && (
            <div className="p-2 bg-warning-light border border-warning rounded text-overline text-warning-dark font-bold">&#9888; Draft in progress saved by {pir.lastUpdatedBy}</div>
          )}
          <div className="space-y-3">
            <div><label htmlFor="pir-root-cause" className="block text-overline text-text-muted font-bold uppercase mb-1">1. Technical Root Cause Summary</label>
              <textarea id="pir-root-cause" rows={2} placeholder="e.g. Buffer leak in callback routers caused duplicate webhook events." value={pirFormState.rootCauseSummary} onChange={(e) => { onPirFormChange({ ...pirFormState, rootCauseSummary: e.target.value }); onPirFormErrorClear('rootCauseSummary'); }} className={`w-full bg-surface border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary ${pirFormErrors.rootCauseSummary ? 'border-error' : 'border-border'}`} aria-invalid={!!pirFormErrors.rootCauseSummary} />
              {pirFormErrors.rootCauseSummary && <p className="text-xs text-error mt-1" role="alert">{pirFormErrors.rootCauseSummary}</p>}
            </div>
            <div><label htmlFor="pir-timeline" className="block text-overline text-text-muted font-bold uppercase mb-1">2. Chronological Milestones Summary</label>
              <textarea id="pir-timeline" rows={2} placeholder="e.g. 14:02 Outage detected; 14:15 Failover initiated; 14:35 Restoration complete." value={pirFormState.timelineSummary} onChange={(e) => onPirFormChange({ ...pirFormState, timelineSummary: e.target.value })} className="w-full bg-surface border border-border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary" />
            </div>
            <div><label htmlFor="pir-impact" className="block text-overline text-text-muted font-bold uppercase mb-1">3. Customer Impact & Refund Release Assessment</label>
              <textarea id="pir-impact" rows={2} placeholder="e.g. Affected 142 POS checkouts, total USD 4,120 in double debits. All automatic releases executed." value={pirFormState.impactSummary} onChange={(e) => onPirFormChange({ ...pirFormState, impactSummary: e.target.value })} className="w-full bg-surface border border-border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label htmlFor="pir-owner" className="block text-overline text-text-muted font-bold uppercase mb-1">4. Preventive Measures Owner</label>
                <input id="pir-owner" type="text" placeholder="e.g. Platform Integrity Team" value={pirFormState.preventiveOwner} onChange={(e) => { onPirFormChange({ ...pirFormState, preventiveOwner: e.target.value }); onPirFormErrorClear('preventiveOwner'); }} className={`w-full bg-surface border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary ${pirFormErrors.preventiveOwner ? 'border-error' : 'border-border'}`} aria-invalid={!!pirFormErrors.preventiveOwner} />
                {pirFormErrors.preventiveOwner && <p className="text-xs text-error mt-1" role="alert">{pirFormErrors.preventiveOwner}</p>}
              </div>
              <div><label htmlFor="pir-due-date" className="block text-overline text-text-muted font-bold uppercase mb-1">5. Remediation Due Date</label>
                <input id="pir-due-date" type="date" value={pirFormState.preventiveDueDate} onChange={(e) => onPirFormChange({ ...pirFormState, preventiveDueDate: e.target.value })} className="w-full bg-surface border border-border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-border shrink-0">
            <button onClick={() => onSaveDraft(incident.id)}
              className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded text-xs font-bold transition shadow-sm cursor-pointer text-center">Save Draft</button>
            <button onClick={onFinalizeAndClose}
              className="flex-1 py-2 bg-success hover:bg-success-dark text-[#fff] rounded text-xs font-bold transition shadow-sm cursor-pointer text-center">Finalize &amp; Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
