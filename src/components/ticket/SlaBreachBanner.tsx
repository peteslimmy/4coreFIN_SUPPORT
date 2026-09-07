import { useState, useEffect } from 'react';
import { TicketRecord, TicketStatus } from '../../types/app';

export default function SlaBreachBanner({ ticket }: { ticket: TicketRecord }) {
  const [breached, setBreached] = useState(false);

  useEffect(() => {
    const checkBreach = () => {
      // Don't show breach banner for closed/resolved tickets
      if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.RESOLVED) {
        setBreached(false);
        return;
      }
      
      // Check if SLA is breached
      if (!ticket.slaDeadline) {
        setBreached(false);
        return;
      }
      
      setBreached(new Date(ticket.slaDeadline).getTime() < Date.now());
    };

    checkBreach();
    
    // Check every minute for changes
    const interval = setInterval(checkBreach, 60 * 1000);
    return () => clearInterval(interval);
  }, [ticket.slaDeadline, ticket.status]);

  if (!breached) return null;
  return (
    <div className="absolute inset-x-0 top-0 bg-primary/20 border-l-4 border-error pulse animate-pulse">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-error" aria-hidden="true"></span>
        <span className="text-[8px] text-error font-medium">SLA BREACHED</span>
      </div>
    </div>
  );
}
