import React from 'react';
import { FileText, Paperclip } from 'lucide-react';
import { TicketRecord } from '../../types/app';
import { useApp } from '../../context/AppContext';
import SectionHeader from './SectionHeader';
import EvidenceTab from './EvidenceTab';

interface OverviewPanelProps {
  ticket: TicketRecord;
}

export function OverviewPanel({ ticket }: OverviewPanelProps) {
  const { evidence, buFormConfigs } = useApp();

  const ticketEvidence = evidence.filter(e => e.ticketId === ticket.id);

  return (
    <div className="space-y-4">
      <section className="solid-surface rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-3.5 h-3.5 text-text-muted" />
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Description</h3>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed bg-surface p-4 rounded-lg border-l-[3px] border-accent/30">
          {ticket.description || 'No description provided.'}
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="solid-surface rounded-xl p-4">
          <SectionHeader icon={<FileText className="w-3 h-3" />} label="Ticket Details" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <MetaField label="Customer" value={ticket.customerName} />
            <MetaField label="Category" value={ticket.category} />
            <MetaField label="Partner" value={ticket.partner} />
            <MetaField label="Amount" value={ticket.amount ? `$${ticket.amount.toLocaleString()}` : undefined} />
            <MetaField label="Transaction ID" value={ticket.transactionId} />
            <MetaField label="Opened" value={ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : undefined} />
          </div>
          {ticket.customFields && Object.keys(ticket.customFields).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Custom Fields</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {Object.entries(ticket.customFields).map(([key, val]) => {
                  const label: string = buFormConfigs.flatMap(c => c.fields).find(f => f.id === key)?.label || key;
                  return <MetaField key={key} label={label} value={String(val)} />;
                })}
              </div>
            </div>
          )}
        </section>

        <section className="solid-surface rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader icon={<Paperclip className="w-3 h-3" />} label="Evidence" />
            <span className="text-xs text-text-muted">{ticketEvidence.length} files</span>
          </div>
          <EvidenceTab ticketId={ticket.id} evidence={ticketEvidence} />
        </section>
      </div>
    </div>
  );
}

function MetaField({ label, value }: { key?: string; label: string; value: string | number | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-text-muted font-medium mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-text-primary">{value ?? '—'}</p>
    </div>
  );
}
