import { formatCurrency } from '../../lib/utils';

function MetaField({ label, value, capitalize }: { label: string; value: string | number | undefined; capitalize?: boolean; key?: string }) {
  return (
    <div>
      <p className="text-caption text-text-muted font-medium mb-1">{label}</p>
      <p className={`text-body-sm font-semibold text-text-primary ${capitalize ? 'capitalize' : ''}`}>{value ?? '—'}</p>
    </div>
  );
}

interface TicketMetadataProps {
  ticket: {
    customerName: string;
    transactionId?: string;
    category: string;
    amount?: number;
    createdAt?: string;
    partner: string;
    customFields?: Record<string, unknown>;
    description: string;
  };
  buFormConfigs: { fields: { id: string; label: string }[] }[];
}

export default function TicketMetadata({ ticket, buFormConfigs }: TicketMetadataProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
      <MetaField label="Customer Name" value={ticket.customerName} />
      <MetaField label="Transaction ID" value={ticket.transactionId} />
      <MetaField label="Issue Category" value={ticket.category} />
      <MetaField label="Amount" value={ticket.amount ? formatCurrency(ticket.amount) : undefined} />
      <MetaField label="Opened" value={ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : undefined} />
      <MetaField label="Partner" value={ticket.partner} />
      {ticket.customFields && Object.keys(ticket.customFields).length > 0 && (
        <>
          <div className="col-span-2 lg:col-span-3 mt-2 pt-4 border-t border-border">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-3">Custom Fields</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6">
              {Object.entries(ticket.customFields).map(([key, val]) => {
                const label = buFormConfigs.flatMap(c => c.fields).find(f => f.id === key)?.label || key;
                return <MetaField key={key} label={label} value={String(val)} capitalize />;
              })}
            </div>
          </div>
          <div className="col-span-2 lg:col-span-3 mt-2 pt-4 border-t border-border">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Description</p>
            <p className="text-text-secondary text-sm leading-relaxed bg-surface p-4 rounded-lg border-l-[3px] border-accent/30">{ticket.description}</p>
          </div>
        </>
      )}
      {(!ticket.customFields || Object.keys(ticket.customFields).length === 0) && (
        <div className="col-span-2 lg:col-span-3 mt-2 pt-4 border-t border-border">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Description</p>
          <p className="text-text-secondary text-sm leading-relaxed bg-surface p-4 rounded-lg border-l-[3px] border-accent/30">{ticket.description}</p>
        </div>
      )}
    </div>
  );
}
