/**
 * Short-TTL cache for requireAuth user-row lookups.
 *
 * requireAuth previously ran `SELECT * FROM users WHERE id = …` on every
 * authenticated request. At 100 RPS that is ~100 identical queries/second for
 * the same handful of active sessions. This cache trades at most TTL seconds
 * of staleness (suspension / role changes propagate within the window) for a
 * near-total elimination of auth lookups on warm paths.
 *
 * The cache self-flushes when the Supabase client identity changes so tests
 * that swap in a fresh fake client per test never observe stale rows.
 */

import type { AppUserRow } from '../auth';

const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE_MAX = 5_000;

interface CacheEntry {
  row: AppUserRow;
  expiresAt: number;
  clientRef: unknown;
}

let cache = new Map<string, CacheEntry>();
let currentClientRef: unknown;

function flushIfStale(clientRef: unknown): void {
  if (currentClientRef !== clientRef) {
    cache = new Map();
    currentClientRef = clientRef;
  }
}

export function getCachedUserRow(clientRef: unknown, id: string): AppUserRow | null {
  flushIfStale(clientRef);
  const hit = cache.get(id);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(id);
    return null;
  }
  return hit.row;
}

export function setUserRowCache(clientRef: unknown, id: string, row: AppUserRow): void {
  flushIfStale(clientRef);
  if (cache.size >= USER_CACHE_MAX && !cache.has(id)) {
    // Evict the soonest-expiring entry to keep the map bounded.
    let oldestKey: string | undefined;
    let oldestExpiry = Infinity;
    for (const [k, v] of cache) {
      if (v.expiresAt < oldestExpiry) {
        oldestExpiry = v.expiresAt;
        oldestKey = k;
      }
    }
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(id, { row, expiresAt: Date.now() + USER_CACHE_TTL_MS, clientRef });
}

/** Drop one user (e.g. after a password/role mutation). */
export function invalidateUserRow(id: string): void {
  cache.delete(id);
}
