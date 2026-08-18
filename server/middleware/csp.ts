import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation
  namespace Express {
    interface Request {
      cspNonce?: string;
    }
  }
}

/**
 * Generate a random nonce for CSP
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * CSP Nonce middleware
 * Generates a unique nonce per request for inline scripts/styles
 * Adds nonce to res.locals for use in templates
 */
export function cspNonceMiddleware(req: Request, res: Response, next: NextFunction) {
  const nonce = generateNonce();
  req.cspNonce = nonce;
  res.locals.cspNonce = nonce;
  next();
}

/**
 * Strict CSP configuration for production
 * Uses nonces for any required inline scripts/styles
 */
export function getCspDirectives(nonce: string) {
  return {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        `'nonce-${nonce}'`,
        // Allow Google Fonts scripts if needed
        'https://fonts.googleapis.com',
      ],
      styleSrc: [
        "'self'",
        `'nonce-${nonce}'`,
        'https://fonts.googleapis.com',
      ],
      styleSrcElem: [
        "'self'",
        `'nonce-${nonce}'`,
        'https://fonts.googleapis.com',
      ],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      connectSrc: ["'self'", 'https://*.supabase.co', 'https://generativelanguage.googleapis.com'],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      prefetchSrc: ["'self'"],
    },
    reportOnly: false,
  };
}

/**
 * Helmet v8 contentSecurityPolicy option.
 *
 * In dev this returns `false` (helmet skips the middleware entirely), which is
 * required for Vite's inline preamble script + HMR websocket.
 * In production it returns a directives object whose nonce values are resolved
 * per-request from `req.cspNonce` (helmet v8 idiom: directive values may be
 * functions of (req, res)). Returning a *function* here does NOT work — helmet
 * treats a function as an options object and falls back to its default CSP.
 */
export function createCspMiddleware(isDev: boolean) {
  if (isDev) {
    return false;
  }
  const nonceFn = (req: Request): string => {
    const nonce = (req as Request & { cspNonce?: string }).cspNonce || generateNonce();
    return `'nonce-${nonce}'`;
  };
  return {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", nonceFn, 'https://fonts.googleapis.com'],
      styleSrc: ["'self'", nonceFn, 'https://fonts.googleapis.com'],
      styleSrcElem: ["'self'", nonceFn, 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      connectSrc: ["'self'", 'https://*.supabase.co', 'https://generativelanguage.googleapis.com'],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      prefetchSrc: ["'self'"],
    },
  };
}

/**
 * Get nonce for use in frontend (e.g., in index.html template)
 */
export function getCspNonce(req: Request): string {
  return req.cspNonce || generateNonce();
}