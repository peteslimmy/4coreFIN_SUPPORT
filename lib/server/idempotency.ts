import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../server/supabaseAdmin';

/**
 * DB-backed idempotency for Next route handlers — mirrors
 * server/middleware/idempotency.ts and shares its `idempotency_keys` table so
 * a key presented to either server during the transition dedupes identically
 * (API-05 semantics: per-actor namespacing, request-hash binding, pending
 * claims, 2xx-only caching).
 */
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const PENDING_CLAIM_STALE_MS = 60_000;

interface IdempotencyRecord {
  response_body: unknown;
  response_status: number;
  request_hash: string;
  created_at?: string;
  expires_at?: string;
}

function actorScopeOf(req: NextRequest): string {
  const session = req.cookies.get('4c_session')?.value;
  if (!session) return 'anon';
  return 'sess-' + createHash('sha256').update(session).digest('hex').slice(0, 24);
}

function hashBody(body: unknown, actorScope: string): string {
  return createHash('sha256').update(`${actorScope}|${JSON.stringify(body ?? {})}`).digest('hex');
}

async function readBody(req: NextRequest): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Wrap a mutation handler with idempotency semantics:
 *   return withIdempotency(req, () => handler());
 * The handler must return a NextResponse. 2xx responses are cached under the
 * key; non-2xx releases the claim so a corrected retry is allowed.
 */
export async function withIdempotency(
  req: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const method = req.method.toUpperCase();
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return handler();

  const rawKey = req.headers.get(IDEMPOTENCY_HEADER)?.trim();
  if (!rawKey) return handler();

  const actorScope = actorScopeOf(req);
  const key = `${actorScope}:${rawKey}`;
  const requestHash = hashBody(await readBody(req), actorScope);

  let existing: IdempotencyRecord | null;
  try {
    const { data, error } = await supabaseAdmin
      .from('idempotency_keys')
      .select('response_body, response_status, request_hash, created_at, expires_at')
      .eq('key', key)
      .maybeSingle();
    if (error) return handler(); // store unavailable — best-effort
    existing = (data as IdempotencyRecord) ?? null;
  } catch {
    return handler();
  }

  if (existing) {
    const notExpired = !existing.expires_at || new Date(existing.expires_at).getTime() > Date.now();
    if (notExpired) {
      if (existing.request_hash !== requestHash) {
        return NextResponse.json({ error: 'Idempotency-Key was already used with a different request body' }, { status: 409 });
      }
      if (existing.response_status > 0) {
        return NextResponse.json(existing.response_body ?? {}, { status: existing.response_status });
      }
      // Pending claim from a concurrent request — brief poll, then 409.
      const createdAtMs = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      if (Date.now() - createdAtMs <= PENDING_CLAIM_STALE_MS) {
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 250));
          try {
            const { data: refreshed } = await supabaseAdmin
              .from('idempotency_keys')
              .select('response_body, response_status, request_hash')
              .eq('key', key)
              .maybeSingle();
            const rec = refreshed as IdempotencyRecord | null;
            if (rec && rec.response_status > 0) {
              if (rec.request_hash !== requestHash) {
                return NextResponse.json({ error: 'Idempotency-Key was already used with a different request body' }, { status: 409 });
              }
              return NextResponse.json(rec.response_body ?? {}, { status: rec.response_status });
            }
            if (!rec) break; // stale claim cleared — fall through to claim
          } catch {
            break;
          }
        }
        return NextResponse.json({ error: 'Request with this Idempotency-Key is still in progress. Retry shortly.' }, { status: 409 });
      }
      // Stale claim — clear it and re-claim below.
      await supabaseAdmin.from('idempotency_keys').delete().eq('key', key).eq('response_status', 0).then(undefined, undefined);
    } else {
      // Expired — discard the old record and claim fresh.
      await supabaseAdmin.from('idempotency_keys').delete().eq('key', key).then(undefined, undefined);
    }
  }

  // Atomic claim.
  try {
    const { error } = await supabaseAdmin
      .from('idempotency_keys')
      .insert({ key, request_hash: requestHash, response_body: null, response_status: 0 });
    if (error && ((error as any).code === '23505' || /duplicate key|unique/i.test(String(error.message)))) {
      return NextResponse.json({ error: 'Request with this Idempotency-Key is already being processed. Retry shortly.' }, { status: 409 });
    }
    if (error) return handler(); // store unavailable — proceed best-effort
  } catch {
    return handler();
  }

  let response: NextResponse;
  try {
    response = await handler();
  } catch (e) {
    await releaseClaim(key);
    throw e;
  }

  if (response.status >= 200 && response.status < 300) {
    try {
      const text = await response.clone().text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* non-JSON body — store as text */
      }
      await supabaseAdmin.from('idempotency_keys').upsert(
        { key, response_body: body, response_status: response.status, request_hash: requestHash },
        { onConflict: 'key' }
      );
    } catch {
      /* cache failure must not change the response */
    }
  } else {
    await releaseClaim(key);
  }
  return response;
}

async function releaseClaim(key: string): Promise<void> {
  try {
    await supabaseAdmin.from('idempotency_keys').delete().eq('key', key).eq('response_status', 0);
  } catch {
    /* ages out via pending-claim staleness */
  }
}
