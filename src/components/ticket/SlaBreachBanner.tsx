import { useMemo } from 'react';
import { Info } from 'lucide-react';

export default function SlaBreachBanner({ ticket }: { ticket: { slaDeadline: string; partner: string } }) {
  const breached = useMemo(() => new Date(ticket.slaDeadline).getTime() < Date.now(), [ticket.slaDeadline]); // eslint-disable-line react-hooks/purity -- Date.now() is safe in useMemo for SLA comparison
  if (!breached) return null;
  return (
    <div className="bg-error/5 border-b border-error/15 px-5 py-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-error shrink-0" aria-hidden="true" />
        <span className="text-xs font-bold text-error">{ticket.partner} Partner Team / SLA Breached</span>
      </div>
    </div>
  );
}
