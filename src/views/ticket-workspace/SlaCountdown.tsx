import { useState, useEffect } from 'react';
import { formatSlaCountdown } from '../../lib/utils';
import { TicketRecord, TicketStatus } from '../../types/app';

interface SlaCountdownProps {
  ticket: TicketRecord;
}

export default function SlaCountdown({ ticket }: SlaCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Don't show countdown for closed/resolved tickets
  if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.RESOLVED) return null;

  const deadlineMs = new Date(ticket.slaDeadline).getTime();
  const diff = deadlineMs - now;

  if (diff <= 0) {
    return (
      <span className="font-mono text-xs text-error font-semibold">
        Breached -{formatSlaCountdown(deadlineMs, now)}
      </span>
    );
  }

  return (
    <span className="font-mono text-xs text-text-primary">
      {formatSlaCountdown(now, deadlineMs)} left
    </span>
  );
}