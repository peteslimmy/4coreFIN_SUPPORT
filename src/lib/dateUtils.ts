export function parseISO(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatRelative(date: string | Date, base: Date = new Date()): string {
  const d = parseISO(date);
  const diffMs = d.getTime() - base.getTime();
  const absMs = Math.abs(diffMs);
  const suffix = diffMs < 0 ? 'ago' : 'from now';

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  if (absMs < MINUTE) return 'just now';
  if (absMs < HOUR) {
    const m = Math.round(absMs / MINUTE);
    return `${m} minute${m === 1 ? '' : 's'} ${suffix}`;
  }
  if (absMs < DAY) {
    const h = Math.round(absMs / HOUR);
    return `${h} hour${h === 1 ? '' : 's'} ${suffix}`;
  }
  if (absMs < 30 * DAY) {
    const days = Math.round(absMs / DAY);
    return `${days} day${days === 1 ? '' : 's'} ${suffix}`;
  }

  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== base.getFullYear()) {
    return d.toLocaleDateString(undefined, opts);
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
