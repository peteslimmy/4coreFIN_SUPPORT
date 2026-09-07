/**
 * Minimal in-memory sliding-window rate limiter for route handlers.
 * NOTE: per-process only. Multi-replica deployments need a shared store
 * (Redis / Postgres) — tracked in docs/24_Backlog_and_Future_Enhancements.md.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(
  req: Request,
  opts: { windowMs: number; max: number; scope: string }
): number | null {
  const now = Date.now();
  sweep(now);
  const fwd = req.headers.get('x-forwarded-for') || '';
  const ip = fwd.split(',')[0].trim() || 'local';
  const key = `${opts.scope}:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > opts.max) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }
  return null;
}
