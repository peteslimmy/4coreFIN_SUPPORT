import { Activity } from 'lucide-react';
import Modal from '../ui/Modal';

interface DeclareFormState {
  name: string;
  description: string;
  partner: string;
  category: string;
  severity: string;
  initialNotification: string;
  affectedPartners: string[];
  affectedBus: string[];
  severityJustification: string;
  expectedRto: string;
  confirmDeclaration: boolean;
}

interface DeclareIncidentModalProps {
  open: boolean;
  onClose: () => void;
  step: 1 | 2;
  onStepChange: (step: 1 | 2) => void;
  form: DeclareFormState;
  onFormChange: (form: DeclareFormState) => void;
  formErrors: Record<string, string>;
  onErrorClear: (field: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  partners: string[];
  businessUnits: string[];
}

export default function DeclareIncidentModal({ open, onClose, step, onStepChange, form, onFormChange, formErrors, onErrorClear, onSubmit, isSubmitting, partners, businessUnits }: DeclareIncidentModalProps) {
  const handleStep1Continue = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Incident name is required';
    if (!form.description.trim()) errs.description = 'Describe the incident';
    if (Object.keys(errs).length > 0) return;
    onStepChange(2);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 1 ? 'Declare New Systemic Major Incident — Step 1 of 2 (Triage)' : 'Declare New Systemic Major Incident — Step 2 of 2 (Assessment & Authorization)'}
      footer={
        <div className="flex gap-2 items-center">
          {step === 2 && (
            <button onClick={() => onStepChange(1)} className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded text-xs font-semibold cursor-pointer">← Back</button>
          )}
          {step === 1 ? (
            <>
              <button onClick={handleStep1Continue}
                className="px-4 py-2 bg-text-primary hover:bg-text-secondary text-[#fff] rounded text-xs font-semibold cursor-pointer">Continue →</button>
              <button onClick={onClose} className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded text-xs cursor-pointer">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={onSubmit} disabled={isSubmitting}
                className="px-4 py-2 bg-error hover:bg-error-dark text-[#fff] rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                <Activity className="w-4 h-4" /> {isSubmitting ? 'Declaring...' : 'Declare Emergency Incident'}
              </button>
              <button onClick={onClose} className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded text-xs cursor-pointer">Cancel</button>
            </>
          )}
        </div>
      }
    >
      {step === 1 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-text-primary">
          <div>
            <label htmlFor="mi-name" className="block text-xs font-medium text-text-secondary mb-1">Incident Name / Subject</label>
            <input id="mi-name" type="text" placeholder="e.g. Parkway API Settlement Delay APAC" value={form.name} onChange={(e) => { onFormChange({ ...form, name: e.target.value }); onErrorClear('name'); }} className={`w-full border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary ${formErrors.name ? 'border-error bg-surface-elevated' : 'border-border bg-surface-elevated'}`} aria-invalid={!!formErrors.name} />
            {formErrors.name && <p className="text-xs text-error mt-1" role="alert">{formErrors.name}</p>}
          </div>
          <div>
            <label htmlFor="mi-partner" className="block text-xs font-medium text-text-secondary mb-1">Primary Payment Partner</label>
            <select id="mi-partner" value={form.partner} onChange={(e) => onFormChange({ ...form, partner: e.target.value })} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary">
              {partners.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mi-severity" className="block text-xs font-medium text-text-secondary mb-1">Incident Severity Level</label>
            <select id="mi-severity" value={form.severity} onChange={(e) => onFormChange({ ...form, severity: e.target.value })} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary font-semibold">
              <option value="CRITICAL">SEV-1 Critical Outage</option>
              <option value="HIGH">SEV-2 High Impact</option>
              <option value="MEDIUM">SEV-3 Moderate Degradation</option>
            </select>
          </div>
          <div>
            <label htmlFor="mi-category" className="block text-xs font-medium text-text-secondary mb-1">Incident Category</label>
            <input id="mi-category" type="text" placeholder="e.g. Duplicate Debit, Settlement Delay" value={form.category} onChange={(e) => onFormChange({ ...form, category: e.target.value })} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Affected Partners</label>
            <div className="flex flex-wrap gap-1.5">
              {partners.map(p => {
                const active = form.affectedPartners.includes(p);
                return (
                  <button type="button" key={p} onClick={() => { onFormChange({ ...form, affectedPartners: active ? form.affectedPartners.filter(x => x !== p) : [...form.affectedPartners, p] }); onErrorClear('scope'); }} className={`px-2.5 py-1 rounded text-overline font-bold uppercase transition cursor-pointer ${active ? 'bg-error text-[#fff]' : 'bg-surface text-text-muted border border-border hover:bg-surface-hover'}`}>{p}</button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Affected Business Units</label>
            <div className="flex flex-wrap gap-1.5">
              {businessUnits.map(bu => {
                const active = form.affectedBus.includes(bu);
                return (
                  <button type="button" key={bu} onClick={() => { onFormChange({ ...form, affectedBus: active ? form.affectedBus.filter(x => x !== bu) : [...form.affectedBus, bu] }); onErrorClear('scope'); }} className={`px-2.5 py-1 rounded text-overline font-bold uppercase transition cursor-pointer ${active ? 'bg-error text-[#fff]' : 'bg-surface text-text-muted border border-border hover:bg-surface-hover'}`}>{bu}</button>
                );
              })}
            </div>
            {formErrors.scope && <p className="text-xs text-error mt-1" role="alert">{formErrors.scope}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="mi-description" className="block text-xs font-medium text-text-secondary mb-1">Operational Description / Initial Findings</label>
            <textarea id="mi-description" rows={2} placeholder="e.g. Adyen bulk checkout callbacks are erroring with HTTP 504. Investigating middleware buffer timeouts." value={form.description} onChange={(e) => { onFormChange({ ...form, description: e.target.value }); onErrorClear('description'); }} className={`w-full bg-surface-elevated border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary ${formErrors.description ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.description} />
            {formErrors.description && <p className="text-xs text-error mt-1" role="alert">{formErrors.description}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-5 text-xs text-text-primary">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="mi-severity-just" className="block text-xs font-medium text-text-secondary mb-1">Severity Justification</label>
              <textarea id="mi-severity-just" rows={3} placeholder="Explain why this is SEV-1 / SEV-2..." value={form.severityJustification} onChange={(e) => { onFormChange({ ...form, severityJustification: e.target.value }); onErrorClear('severityJustification'); }} className={`w-full bg-surface-elevated border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary ${formErrors.severityJustification ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.severityJustification} />
              {form.severity === 'CRITICAL' && <p className="text-xs text-warning-dark mt-1">Required for a SEV-1 (CRITICAL) declaration.</p>}
              {formErrors.severityJustification && <p className="text-xs text-error mt-1" role="alert">{formErrors.severityJustification}</p>}
            </div>
            <div>
              <label htmlFor="mi-rto" className="block text-xs font-medium text-text-secondary mb-1">Expected RTO</label>
              <input id="mi-rto" type="text" placeholder="e.g. 60 min" value={form.expectedRto} onChange={(e) => onFormChange({ ...form, expectedRto: e.target.value })} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary" />
              <label htmlFor="mi-notification" className="block text-xs font-medium text-text-secondary mb-1 mt-3">Initial Stakeholder Notification</label>
              <select id="mi-notification" value={form.initialNotification} onChange={(e) => onFormChange({ ...form, initialNotification: e.target.value })} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring text-text-primary">
                <option value="Slack/Teams Webhook">All Hands: Broadcast to #ops-alerts Slack Channel</option>
                <option value="Executive Advisory">Executive Advisory: Send Email to board@company.com</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="mi-impact" className="block text-xs font-medium text-text-secondary mb-1">Customer Impact &amp; Refund Assessment</label>
            <textarea id="mi-impact" rows={2} disabled placeholder="Impact summary capture pending — add to the PIR during investigation." className="w-full bg-surface border border-border rounded p-2 text-xs outline-none text-text-muted cursor-not-allowed" />
          </div>
          <label className="flex items-start gap-2 bg-surface border border-border rounded p-3 text-xs cursor-pointer">
            <input type="checkbox" checked={form.confirmDeclaration} onChange={(e) => { onFormChange({ ...form, confirmDeclaration: e.target.checked }); onErrorClear('confirmDeclaration'); }} className="mt-0.5" />
            <span className="text-text-primary font-semibold">I confirm this is a real, unfolding systemic major incident that warrants an emergency declaration and stakeholder broadcast.</span>
          </label>
          {formErrors.confirmDeclaration && <p className="text-xs text-error" role="alert">{formErrors.confirmDeclaration}</p>}
        </div>
      )}
    </Modal>
  );
}
