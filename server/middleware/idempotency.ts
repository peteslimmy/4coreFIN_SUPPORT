import { supabase } from '../supabase';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

/** Idempotency key header name */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Extract the idempotency key from the request, or return undefined. */
function extractIdempotencyKey(req: Request): string | undefined {
  const key = req.headers[IDEMPOTENCY_HEADER];
  return key ? String(key).trim() : undefined;
}

/** Hash the request body for idempotency validation. */
function hashBody(req: Request): string {
  return require('crypto').createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
}

/** Cache a response in the idempotency store. */
async function cacheResponse(key: string, body: any, statusCode: number): Promise<void> {
  try {
    await supabase.from('idempotency_keys').upsert({
      key,
      response_body: body,
      response_status: statusCode,
    });
  } catch (e) {
    logger.info({ err: e, key }, 'idempotency cache error');
  }
}

/** Idempotency middleware: check for cached response; if not found, attach a
 *  cache hook for the route handler to use after it sends its response. */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only apply to state-changing POST/PUT routes
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return next();
  }

  const key = extractIdempotencyKey(req);
  if (!key) {
    // No idempotency key provided; proceed without enforcement
    return next();
  }

  const bodyHash = hashBody(req);

  // Check if this key+hash already exists
  let data: { response_body: any; response_status: number } | null = null;
  let dbError: any = null;

  try {
    const { data: d, error } = await supabase.from('idempotency_keys')
      .select('response_body, response_status')
      .eq('key', key)
      .maybeSingle();

    data = d;
    dbError = error;
  } catch (e) {
    logger.info({ err: e }, 'idempotency DB error');
    return next();
  }

  if (dbError) {
    logger.info({ err: dbError }, 'idempotency DB error');
    return next();
  }

  if (data) {
    // Key exists – return cached response
    const cached = data.response_body;
    if (typeof cached === 'object') {
      res.json(cached);
    } else if (typeof cached === 'string') {
      res.type('text').send(cached);
    } else {
      res.status(data.response_status || 200).send(String(cached));
    }
  } else {
    // Key not found; attach a helper for the route handler to cache the response
    res.locals.idempotencyKey = key;
    res.locals.idempotencyCache = async (body: any, statusCode: number = res.statusCode) => {
      await cacheResponse(res.locals.idempotencyKey, body, statusCode);
    };
    return next();
  }
}