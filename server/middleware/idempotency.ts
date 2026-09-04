import { createHash } from 'node:crypto';
import { supabase } from '../supabase';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { SESSION_COOKIE, parseCookies } from '../auth';

/** Idempotency key header name */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

interface IdempotencyRecord {
  response_body: unknown;
  response_status: number;
  request_hash: string;
  created_at?: string;
  expires_at?: string;
}

/** Extract the idempotency key from the request, or return undefined. */
function extractIdempotencyKey(req: Request): string | undefined {
  // Node lowercases incoming header names; headers may arrive as
  // 'idempotency-key', 'Idempotency-Key', or any case variant.
  const name = req.headers[IDEMPOTENCY_HEADER] ?? req.headers[IDEMPOTENCY_HEADER.toLowerCase()];
  const raw = Array.isArray(name) ? name[0] : name;
  const key = raw ? String(raw).trim() : undefined;
  return key || undefined;
}

/** Canonical body hash used to detect key reuse with a different payload.
 * The optional actor scope is folded into the hash so two principals can
 * never collide on (key, body). */
export function hashBody(body: unknown, actorScope?: string): string {
  const prefix = actorScope ? `${actorScope}|` : '';
  return createHash('sha256').update(prefix + JSON.stringify(body ?? {})).digest('hex');
}

/**
 * Actor scope for idempotency keys. Authentication happens per-route (after
 * this middleware runs), so the principal is derived from the session cookie:
 * two different users never share an idempotency namespace, which closes the
 * cross-account response-replay hole (API-05). Unauthenticated callers (unit
 * tests, pre-auth endpoints) share the 'anon' scope.
 */
function actorScopeOf(req: Request): string {
  const cookies = parseCookies(req.headers.cookie);
  const session = cookies[SESSION_COOKIE];
  if (!session) return 'anon';
  return 'sess-' + createHash('sha256').update(session).digest('hex').slice(0, 24);
}

/**
 * Cache the response body + status under the given key. Best-effort: failures
 * must never change the response the caller already received.
 */
async function cacheResponse(key: string, opts: { body: unknown; statusCode: number; requestHash: string }): Promise<void> {
  try {
    await supabase.from('idempotency_keys').upsert({
      key,
      response_body: opts.body,
      response_status: opts.statusCode,
      request_hash: opts.requestHash,
    }, { onConflict: 'key' });
  } catch (e) {
    logger.info({ err: e, key }, 'idempotency cache error');
  }
}

/** Reconstruct a cached response. The stored value is whatever the handler
 * sent through res.send/res.json (JSONB round-trips objects to objects, and
 * keeps JSON text as strings). Send JSON text back with the JSON content-type
 * so downstream clients parse it exactly as the original. */
function sendCached(res: Response, statusCode: number, raw: unknown): void {
  if (typeof raw === 'string') {
    res.status(statusCode).type('application/json').send(raw);
    return;
  }
  res.status(statusCode).json(raw ?? {});
}

/**
 * Atomically claim a key by inserting a pending row. Returns 'claimed' when
 * this request owns the key, 'exists' when a row is already present (unique
 * violation), or 'unavailable' when the store cannot enforce uniqueness
 * (e.g. in-memory test doubles) — callers then proceed best-effort.
 */
async function claimKey(key: string, requestHash: string): Promise<'claimed' | 'exists' | 'unavailable'> {
  try {
    const { error } = await supabase.from('idempotency_keys')
      .insert({ key, request_hash: requestHash, response_body: null, response_status: 0 });
    if (!error) return 'claimed';
    if ((error as any).code === '23505' || /duplicate key|unique/i.test(String(error.message))) return 'exists';
    return 'unavailable';
  } catch (e) {
    logger.info({ err: e, key }, 'idempotency claim error');
    return 'unavailable';
  }
}

const PENDING_CLAIM_STALE_MS = 60_000;

/**
 * Release a pending claim (non-2xx outcomes must allow a corrected retry,
 * mirroring the "only 2xx responses are cached" rule). Best-effort.
 */
async function releaseClaim(key: string): Promise<void> {
  try {
    await supabase.from('idempotency_keys').delete().eq('key', key).eq('response_status', 0);
  } catch {
    // A leaked pending claim ages out via PENDING_CLAIM_STALE_MS.
  }
}
const PRUNE_INTERVAL_MS = 10 * 60_000;
let lastPruneAt = 0;

/** Best-effort TTL prune of expired keys, throttled to once per interval so
 * the idempotency_keys table cannot grow unboundedly (API-05). Failures are
 * logged and never affect the request. */
function pruneExpiredKeys(): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  Promise.resolve(
    supabase.from('idempotency_keys').delete().lt('expires_at', new Date().toISOString())
  )
    .then(({ error }) => {
      if (error) logger.info({ err: error }, 'idempotency prune error');
    })
    .catch((e) => logger.info({ err: e }, 'idempotency prune error'));
}

/**
 * Replay logic for POST/PUT/PATCH requests that carry an Idempotency-Key header.
 *
 * Existing w/ matching request hash  → replay the cached response unchanged.
 * Existing w/ different request hash → 409 conflict (key reused incorrectly).
 * Existing but expired               → discarded, treated as a fresh request.
 * Missing                            → atomically claim the key, then run.
 *
 * Keys are namespaced per principal (session), and the principal is folded
 * into the request hash, so user A can never replay user B's cached response
 * by sending the same key + body (API-05).
 *
 * The claim step closes the TOCTOU race where two concurrent requests with
 * the same key both observed "no record" and executed the handler twice,
 * creating duplicate resources despite idempotent intent.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  const rawKey = extractIdempotencyKey(req);
  if (!rawKey) {
    return next();
  }

  // Namespace the client-supplied key by principal so idempotency scopes are
  // never shared across accounts, and bind the actor into the body hash.
  const actorScope = actorScopeOf(req);
  const key = `${actorScope}:${rawKey}`;
  const requestHash = hashBody(req.body, actorScope);
  pruneExpiredKeys();
  let record: IdempotencyRecord | null;

  try {
    const { data, error } = await supabase.from('idempotency_keys')
      .select('response_body, response_status, request_hash, created_at, expires_at')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      logger.info({ err: error, key }, 'idempotency DB read error');
      return next();
    }
    record = data as IdempotencyRecord | null;
  } catch (e) {
    // DB unavailable: let the request through; protection is best-effort.
    logger.info({ err: e, key }, 'idempotency DB error');
    return next();
  }

  const expiresAt = record?.expires_at ? new Date(record.expires_at).getTime() : 0;
  // No expiry column value (older rows / in-memory stores) → treat as valid.
  const notExpired = record && (!record.expires_at ? true : expiresAt > Date.now());

  if (record && notExpired) {
    if (record.request_hash !== requestHash) {
      return res.status(409).json({ error: 'Idempotency-Key was already used with a different request body' });
    }
    if (record.response_status > 0) {
      sendCached(res, record.response_status, record.response_body);
      return;
    }
    // Pending claim from a concurrent request. Wait briefly for it to settle;
    // give up waiting after ~5s and proceed (protection is advisory at that point).
    const createdAtMs = record.created_at ? new Date(record.created_at).getTime() : 0;
    if (Date.now() - createdAtMs > PENDING_CLAIM_STALE_MS) {
      // Stale claim (handler crashed before caching) — clear it and re-claim below.
      await supabase.from('idempotency_keys').delete().eq('key', key).eq('response_status', 0);
      // Fall through to the fresh-key claim path.
    } else {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 250));
        try {
          const { data: refreshed } = await supabase.from('idempotency_keys')
            .select('response_body, response_status, request_hash, created_at, expires_at')
            .eq('key', key)
            .maybeSingle();
          const rec = refreshed as IdempotencyRecord | null;
          if (rec && rec.response_status > 0) {
            if (rec.request_hash !== requestHash) {
              return res.status(409).json({ error: 'Idempotency-Key was already used with a different request body' });
            }
            return sendCached(res, rec.response_status, rec.response_body);
          }
          if (!rec) break; // stale-claim cleanup won the race — fall through to claim
        } catch {
          break;
        }
      }
      return res.status(409).json({ error: 'Request with this Idempotency-Key is still in progress. Retry shortly.' });
    }
  }

  // Fresh key: attempt an atomic claim before running the handler. When the
  // store enforces uniqueness, exactly one concurrent caller wins the claim;
  // losers are told to retry rather than double-executing the mutation.
  const claim = await claimKey(key, requestHash);
  if (claim === 'exists') {
    return res.status(409).json({ error: 'Request with this Idempotency-Key is already being processed. Retry shortly.' });
  }

  // Run the handler and cache whatever it sends.
  // Only 2xx responses are cached — replaying a failed request under the same
  // key after fixing the payload must be allowed, not pinned to the old error.
  // A failed handler leaves the pending claim to age out via PENDING_CLAIM_STALE_MS.
  const originalJson = res.json;
  const originalSend = res.send;
  const originalStatus = res.status.bind(res);
  let statusCode = res.statusCode;

  (res.status as any) = (code: number) => {
    statusCode = code;
    return originalStatus(code);
  };

  // Cache at the `send` layer: `res.json()` delegates to `res.send(str)` so
  // hooking only `send` prevents double-caching a stringified body.
  res.send = (body: unknown) => {
    const code = statusCode || res.statusCode;
    if (code >= 200 && code < 300) {
      const fn = async () => {
        await cacheResponse(key, { body, statusCode: code, requestHash });
      };
      fn();
    } else {
      // Non-2xx: free the claim so a corrected retry with the same key is
      // not blocked by the pending-claim guard.
      void releaseClaim(key);
    }
    return (originalSend as any).call(res, body);
  };

  // Preserve res.json semantics (it routes through res.send above).
  res.json = (body: unknown) => {
    return (originalJson as any).call(res, body);
  };

  return next();
}