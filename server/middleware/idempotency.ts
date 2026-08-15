import { createHash } from 'node:crypto';
import { supabase } from '../supabase';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

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

/** Canonical body hash used to detect key reuse with a different payload. */
export function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
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
 * Replay logic for POST/PUT requests that carry an Idempotency-Key header.
 *
 * Existing w/ matching request hash  → replay the cached response unchanged.
 * Existing w/ different request hash → 409 conflict (key reused incorrectly).
 * Existing but expired              → discarded, treated as a fresh request.
 * Missing                           → proceed and auto-cache the final response.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return next();
  }

  const key = extractIdempotencyKey(req);
  if (!key) {
    return next();
  }

  const requestHash = hashBody(req.body);
  let record: IdempotencyRecord | null = null;

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
    sendCached(res, record.response_status, record.response_body);
    return;
  }

  // Fresh key (or expired): run the handler and cache whatever it sends.
  // Only 2xx responses are cached — replaying a failed request under the same
  // key after fixing the payload must be allowed, not pinned to the old error.
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
    }
    return (originalSend as any).call(res, body);
  };

  // Preserve res.json semantics (it routes through res.send above).
  res.json = (body: unknown) => {
    return (originalJson as any).call(res, body);
  };

  return next();
}