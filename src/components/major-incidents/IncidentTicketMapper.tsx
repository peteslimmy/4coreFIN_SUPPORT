import { Plus, X } from 'lucide-react';
import type { MajorIncidentRecord, TicketRecord } from '../../types/app';

interface IncidentTicketMapperProps {
  incident: MajorIncidentRecord;
  tickets: TicketRecord[];
  onLink: (miId: string, ticketId: string) => void;
  onUnlink: (miId: string, ticketId: string) => void;
  showToast: (message: string, type?: string) => void;
}

export default function IncidentTicketMapper({ incident, tickets, onLink, onUnlink, showToast }: IncidentTicketMapperProps) {
  const linkedTickets = tickets.filter(t => t.majorIncidentId === incident.id);

  return (
    <div className="bg-surface-elevated rounded-xl shadow-card p-5 space-y-4 flex-1 flex flex-col overflow-hidden">
      <div>
        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-accent" /> Map Complaint to Cluster
        </h4>
        <p className="text-xs text-text-muted mt-1">Associate individual payments tickets to coordinate bulk resolution SLAs.</p>
      </div>
      <div className="flex gap-2">
        <select id="bulk-map-select-el" aria-label="Select ticket to link" className="flex-1 bg-surface border border-border rounded p-2 text-xs font-semibold focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring">
          <option value="">-- Select Active Complaint --</option>
          {tickets.filter(t => t.majorIncidentId !== incident.id).map(t => (
            <option key={t.id} value={t.id}>{t.id} - {t.customerName} ({t.category})</option>
          ))}
        </select>
        <button onClick={() => {
          const selectEl = document.getElementById('bulk-map-select-el') as HTMLSelectElement | null;
          const tId = selectEl?.value;
          if (!tId) { showToast('Please select a ticket record first.', 'error'); return; }
          onLink(incident.id, tId);
          if (selectEl) selectEl.value = '';
        }} className="px-3.5 bg-accent hover:bg-accent-light text-[#fff] text-xs font-semibold rounded transition-all cursor-pointer focus-ring">Link</button>
      </div>
      <div className="border-t border-border pt-6 flex-1 flex flex-col overflow-hidden">
        <span className="text-overline text-text-muted font-bold uppercase tracking-widest block mb-6">Associated Tickets ({linkedTickets.length})</span>
        <div className="space-y-2 overflow-y-auto flex-1 pr-1">
          {linkedTickets.length === 0 ? (
            <p className="text-xs text-text-muted italic text-center py-6 bg-surface rounded border border-dashed">No individual customer complaints mapped to this major incident cluster yet.</p>
          ) : (
            linkedTickets.map(t => (
              <div key={t.id} className="bg-surface hover:bg-surface-hover p-2.5 rounded-lg border border-border flex items-start justify-between gap-3 text-xs transition">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-overline font-bold text-accent">{t.id}</span>
                    <span className="text-overline bg-error-light text-error font-bold px-1 rounded">{t.priority}</span>
                  </div>
                  <p className="font-semibold text-text-primary truncate">{t.customerName}</p>
                  <p className="text-overline text-text-muted truncate">{t.description}</p>
                </div>
                <button onClick={() => onUnlink(incident.id, t.id)} aria-label="Unlink ticket from incident" className="text-text-muted hover:text-error p-1 rounded hover:bg-surface-hover transition focus-ring" title="Unlink and handle individually"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
