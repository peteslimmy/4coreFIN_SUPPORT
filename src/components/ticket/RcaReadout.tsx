interface RcaReadoutTicket {
  rcaDetails?: {
    rootCause?: string;
    contributingFactors?: string;
    correctiveActions?: string;
    preventiveActions?: string;
    preventiveOwner?: string;
    preventiveDueDate?: string;
    resolvedBy?: string;
    resolvedAt?: string;
  };
  rootCause?: string;
  correctableAction?: string;
}

function RcaField({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={`${span ? 'col-span-2' : ''} bg-surface-elevated p-3.5 rounded-lg border border-border`}>
      <span className="font-semibold text-text-muted text-xs block mb-1">{label}</span>
      <p className="text-text-primary leading-relaxed">{value || 'N/A'}</p>
    </div>
  );
}

function RcaPersonField({ label, name, mono }: { label: string; name?: string; mono?: boolean }) {
  return (
    <div className="bg-surface-elevated p-3.5 rounded-lg border border-border flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
        <svg className="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
      </div>
      <div>
        <span className="font-semibold text-text-muted text-xs block">{label}</span>
        <p className={`text-text-primary font-semibold text-xs mt-0.5 ${mono ? 'font-mono' : ''}`}>{name || 'N/A'}</p>
      </div>
    </div>
  );
}

export default function RcaReadout({ ticket }: { ticket: RcaReadoutTicket }) {
  const r = ticket.rcaDetails || {};
  return (
    <div className="bg-surface rounded-xl p-6">
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">Root Cause Analysis</h4>
        <span className="text-[10px] bg-primary-light text-primary-dark px-2 py-0.5 rounded font-mono font-semibold">Auditable</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
        <RcaField label="Root Cause" value={r.rootCause || ticket.rootCause || ''} span />
        <RcaField label="Contributing Factors" value={r.contributingFactors || 'N/A'} span />
        <RcaField label="Corrective Actions" value={r.correctiveActions || (ticket as { correctableAction?: string }).correctableAction || 'N/A'} />
        <RcaField label="Preventive Actions" value={r.preventiveActions || 'N/A'} />
        <RcaPersonField label="Owner" name={r.preventiveOwner} />
        <RcaPersonField label="Due Date" name={r.preventiveDueDate} mono />
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
        <span>Verified: <strong className="text-text-primary">{r.resolvedBy || 'N/A'}</strong></span>
        <span>Timestamp: <strong className="text-text-primary">{r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : 'N/A'}</strong></span>
      </div>
    </div>
  );
}
