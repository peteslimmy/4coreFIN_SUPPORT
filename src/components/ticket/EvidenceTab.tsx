import { FileText, Paperclip } from 'lucide-react';
import type { FileEvidence } from '../../types/app';

interface EvidenceTabProps {
  ticketId: string;
  evidence: FileEvidence[];
}

export default function EvidenceTab({ ticketId, evidence }: EvidenceTabProps) {
  const sorted = [...evidence].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Paperclip className="w-8 h-8 text-text-muted/40 mb-3" />
        <p className="text-sm font-semibold text-text-primary">No evidence attached</p>
        <p className="text-xs text-text-muted mt-1">Files uploaded for {ticketId} will appear here.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1">
      {sorted.map(ev => (
        ev.url ? (
          <a
            key={ev.id}
            href={ev.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-accent/40 hover:bg-surface-hover transition-all group"
            title={`${ev.fileName} — uploaded by ${ev.uploadedBy}`}
          >
            {ev.fileType?.startsWith('image/') ? (
              <img src={ev.url} alt={ev.fileName} className="w-9 h-9 rounded object-cover border border-border shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded bg-primary-light flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-text-primary truncate group-hover:text-accent">{ev.fileName}</span>
              <span className="block text-[10px] text-text-muted mt-0.5">
                {(ev.fileSize / 1024).toFixed(0)} KB · {ev.uploadedBy} · {new Date(ev.uploadedAt).toLocaleString()}
              </span>
            </span>
          </a>
        ) : (
          <div
            key={ev.id}
            className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border opacity-75"
            title={`${ev.fileName} — link unavailable (uploaded by ${ev.uploadedBy})`}
          >
            <span className="w-9 h-9 rounded bg-surface-elevated flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-text-muted" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-text-primary truncate">{ev.fileName}</span>
              <span className="block text-[10px] text-text-muted mt-0.5">
                {(ev.fileSize / 1024).toFixed(0)} KB · {ev.uploadedBy} · link expired
              </span>
            </span>
          </div>
        )
      ))}
    </div>
  );
}
