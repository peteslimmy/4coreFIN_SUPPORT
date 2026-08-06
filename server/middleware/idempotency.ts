import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase';
import crypto from 'crypto';

interface IdempotencyRecord {
  key: string;
  response_body: any;
  response_status: number;
  request_hash: string;
  created_at: string;
  expires_at: string;
}

/**
 * Generate a hash of the request body for validation
 */
function hashRequestBody(body: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}

/**
 * Idempotency middleware for POST/PATCH/PUT/DELETE requests
 * 
 * Usage: Apply to routes that should be idempotent
 * router.post('/tickets', requireAuth, requirePermission('tickets:create'), idempotencyMiddleware, handler);
 * 
 * Client sends: Idempotency-Key: <unique-key-per-operation>
 * 
 * On first request: Processes normally, stores response
 * On repeat with same key: Returns cached response (if request body matches)
 */
export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (SAFE_METHODS.has(req.method)) return next();

  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) return next(); // Optional header

  // Validate key format (UUID or similar)
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Invalid Idempotency-Key format' });
  }

  const requestHash = hashRequestBody(req.body);

  // Check for existing idempotency record
  Promise.resolve(
    supabase
      .from('idempotency_keys')
      .select('response_body, response_status, request_hash')
      .eq('key', idempotencyKey)
      .single()
  )
    .then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Idempotency check error:', error);
        return next(); // Fail open on DB error
      }

      if (data) {
        // Key exists - verify request body matches
        if (data.request_hash !== requestHash) {
          return res.status(409).json({
            error: 'Idempotency key reused with different request body',
            code: 'IDEMPOTENCY_KEY_CONFLICT'
          });
        }

        // Return cached response
        res.setHeader('X-Idempotency-Replay', 'true');
        return res.status(data.response_status).json(data.response_body);
      }

      // No existing record - capture response
      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);
      let capturedStatus = 200;
      let capturedBody: any = null;

      res.status = ((code: number) => {
        capturedStatus = code;
        return originalStatus(code);
      }) as any;

      res.json = ((body: any) => {
        capturedBody = body;
        // Store idempotency record asynchronously (don't block response)
        Promise.resolve(
          supabase
            .from('idempotency_keys')
            .insert({
              key: idempotencyKey,
              response_body: body,
              response_status: capturedStatus,
              request_hash: requestHash,
            })
        )
          .then(({ error }) => {
            if (error) console.error('Failed to store idempotency key:', error);
          })
          .catch((err) => {
            console.error('Idempotency middleware error:', err);
          });
        return originalJson(body);
      }) as any;

      next();
    })
    .catch((err) => {
      console.error('Idempotency middleware error:', err);
      next(); // Fail open
    });
}

/**
 * Middleware factory for routes that require idempotency
 */
export function requireIdempotency(req: Request, res: Response, next: NextFunction) {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (SAFE_METHODS.has(req.method)) return next();

  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'Idempotency-Key header required for this endpoint',
      code: 'IDEMPOTENCY_KEY_REQUIRED'
    });
  }

  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Invalid Idempotency-Key format' });
  }

  next();
}