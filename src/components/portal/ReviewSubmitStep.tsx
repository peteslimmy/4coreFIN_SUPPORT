import type { ReactNode } from 'react';
import { User, Building2, CreditCard, FileText, Paperclip, AlertTriangle } from 'lucide-react';
import type { BuFormConfig, FormFieldValue } from '../../types/forms';

interface ReviewSubmitStepProps {
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  partner: string;
  category: string;
  bankName: string;
  buFormConfig: BuFormConfig;
  txValues: Record<string, FormFieldValue>;
  description: string;
  uploadedFiles: File[];
}

function ReviewRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {icon && <span className="text-text-muted mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-medium text-text-primary break-words">{value || <span className="text-text-muted italic">Not provided</span>}</p>
      </div>
    </div>
  );
}

export default function ReviewSubmitStep({
  customerFirstName, customerLastName, customerEmail, customerPhone,
  partner, category, bankName,
  buFormConfig, txValues,
  description, uploadedFiles,
}: ReviewSubmitStepProps) {
  const customerName = [customerFirstName, customerLastName].filter(Boolean).join(' ') || '';
  const enabledFields = buFormConfig.fields.filter(f => f.enabled);

  return (
    <div className="space-y-5">
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary">Please review all details below before submitting. You can go back to any step to make changes.</p>
      </div>

      <div className="bg-surface rounded-lg border border-border-subtle p-4">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" /> Customer Identity
        </h4>
        <ReviewRow label="Full Name" value={customerName} />
        <ReviewRow label="Email Address" value={customerEmail} />
        <ReviewRow label="Phone Number" value={customerPhone} />
      </div>

      <div className="bg-surface rounded-lg border border-border-subtle p-4">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Incident Details
        </h4>
        <ReviewRow label="Payment Partner" value={partner} />
        <ReviewRow label="Issue Category" value={category} />
        <ReviewRow label="Bank" value={bankName} />
      </div>

      {enabledFields.length > 0 && (
        <div className="bg-surface rounded-lg border border-border-subtle p-4">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" /> Transaction Information
          </h4>
          {enabledFields.map(f => (
            <div key={f.id}>
              <ReviewRow
                label={f.label}
                value={String(txValues[f.id] ?? '')}
              />
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface rounded-lg border border-border-subtle p-4">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Description
        </h4>
        <p className="text-sm text-text-primary whitespace-pre-wrap">{description || <span className="text-text-muted italic">Not provided</span>}</p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="bg-surface rounded-lg border border-border-subtle p-4">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Evidence ({uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''})
          </h4>
          <ul className="space-y-1">
            {uploadedFiles.map((f, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-center gap-2">
                <Paperclip className="w-3 h-3 text-text-muted" />
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-text-muted shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
