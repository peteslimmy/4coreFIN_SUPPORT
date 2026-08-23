import { useState, useEffect } from 'react';
import { formatSlaCountdown } from '../../lib/utils';

interface SlaCountdownProps {
  deadline: string;
}

export default function SlaCountdown({ deadline }: SlaCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const deadlineMs = new Date(deadline).getTime();
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