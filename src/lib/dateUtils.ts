export function parseISO(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Compact relative time formatter for chat/activity feeds.
 * Examples: "just now", "3m ago", "2h ago", "5d ago", "Jan 15"
 */
export function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Date group label for grouped feeds: "Today", "Yesterday", or "Mon, Jan 15".
 */
export function formatDateLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - dateOnly.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Format a duration in hours to a compact string: "3d", "12h", "45m".
 */
export function formatHoursCompact(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Format a Date to a display string: "Aug 15, 2026, 2:30 PM"
 */
export function formatDateTime(date: string | Date): string {
  return parseISO(date).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a Date to a date-only string: "Aug 15, 2026"
 */
export function formatDate(date: string | Date): string {
  return parseISO(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a Date to a time-only string: "2:30 PM"
 */
export function formatTime(date: string | Date): string {
  return parseISO(date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
