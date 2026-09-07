import express from "express";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { createServer as createViteServer } from "vite";
// Load env BEFORE anything else, since server/ modules throw at import time
// if SUPABASE_* are absent. `import 'dotenv/config'` runs during ESM
// import evaluation (hoisted first), ahead of downstream server/ imports.
import "dotenv/config";
import { createApiRouter } from "./server/routes";
import { createAdminSettingsRouter } from "./server/routes/adminSettings";
import { createReferenceRouter } from "./server/routes/reference";
import { startSlaJob, stopSlaJob } from "./server/slaJob";
import { startEscalationJob, stopEscalationJob } from "./server/escalationEngine";
import { initEventBus } from "./server/eventBus";
import { requireAuth, requireCsrf, type AuthedRequest } from "./server/auth";
import { logger, requestIdMiddleware } from "./server/logger";
import { idempotencyMiddleware } from "./server/middleware/idempotency";
import { createUploadGate, rejectOversize } from "./server/middleware/uploadGate";
import { cspNonceMiddleware, createCspMiddleware } from "./server/middleware/csp";
import { removeSseClient, getSseClients, closeAllSseConnections } from "./server/broadcast";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./server/openapi";
import { supabase } from "./server/supabase";

import dotenv from "dotenv";
dotenv.config(); // belt-and-suspenders against overridden env

// Validate required environment variables
function validateEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Check your .env file.`);
  }
  
  // Validate JWT_SECRET strength (must be at least 32 characters, not a known weak value)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for security');
  }
  if (process.env.JWT_SECRET && /^(.)\1{31,}$/.test(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET must not be a repeated character');
  }
  
  // Validate ENCRYPTION_KEY (must be 64 hex chars = 32 bytes)
  if (process.env.ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  
  // Validate optional but recommended environment variables
  const recommended = ['GEMINI_API_KEY', 'REDIS_URL'];
  const missingRecommended = recommended.filter(key => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(`Missing recommended environment variables: ${missingRecommended.join(', ')}. Some features may be disabled.`);
  }
  // All production logins MUST go through Supabase Auth. Refuse to boot with a
  // provider that would accept locally-hashed passwords in production.
  if (process.env.NODE_ENV === 'production') {
    const provider = process.env.AUTH_PROVIDER || 'supabase';
    if (provider !== 'supabase') {
      throw new Error(`AUTH_PROVIDER=${provider} is not allowed in production. Production requires AUTH_PROVIDER=supabase so all login goes through Supabase Auth.`);
    }
  }
}

async function startServer() {
  validateEnv();
  // Note: no automatic data seeding on boot. First-run data (e.g. the initial
  // SUPER_ADMIN account, reference lists) must be created explicitly via the
  // documented bootstrap flow (see docs/BOOTSTRAP.md).

  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  // Trust exactly one proxy hop when deployed behind a reverse proxy / load
  // balancer. Without this, req.ip is the proxy's address and every client
  // shares a single rate-limit bucket (the whole API effectively capped at
  // `max` requests/minute for ALL users combined). Opt-in via TRUST_PROXY so
  // direct deployments cannot have X-Forwarded-For spoofed.
  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  app.use(express.json({ limit: "5mb" }));

  // Compression middleware - compress responses > 1KB
app.use(compression({ threshold: 1024, level: 6 }));

  // Request ID middleware - adds unique request ID and structured logging
  app.use(requestIdMiddleware);

  // CSP Nonce middleware - generates nonce per request for strict CSP
  app.use(cspNonceMiddleware);

  // Security headers — relaxed for Vite dev, strict for production
  const isDev = process.env.NODE_ENV !== 'production';
  app.use(helmet({
    contentSecurityPolicy: createCspMiddleware(isDev) as any,
    crossOriginEmbedderPolicy: !isDev,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    originAgentCluster: true,
    hsts: isDev ? false : {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // Deny access to browser features the SPA never uses (defense-in-depth;
  // helmet v8 does not emit Permissions-Policy itself).
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), gamepad=()'
    );
    next();
  });

  // Health check — registered before the API limiter/CSRF so probes are never
  // throttled or require a session.
  app.get("/api/health", async (_req, res) => {
    const health = {
      ok: true,
      ts: new Date().toISOString(),
      dependencies: {
        supabase: 'unknown',
      },
    };
    
    // Check Supabase connectivity
    try {
      const { error } = await supabase.from('users').select('count').limit(1);
      health.dependencies.supabase = error ? 'error' : 'ok';
      if (error) health.ok = false;
    } catch (e) {
      health.dependencies.supabase = 'error';
      health.ok = false;
    }
    
    const status = health.ok ? 200 : 503;
    res.status(status).json(health);
  });

  // Interactive API documentation (Swagger UI). Only exposed in non-production
  // so strict production CSP never has to relax script-src for third-party UIs.
  if (process.env.NODE_ENV !== 'production') {
    const docsLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(
      '/docs',
      docsLimiter,
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, { customSiteTitle: '4CoreFinSupport API' })
    );
  }


  // Rate limiting — general API. Max is env-tunable so high-concurrency
  // deployments can raise the ceiling without a code change.
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: Number(process.env.API_RATE_LIMIT_MAX) || 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  // Stricter rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' },
  });

  // Stricter limit for evidence uploads (large bodies, high abuse potential)
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many uploads, please try again later.' },
  });

  // Upload memory-pressure control: upload handlers buffer the full body
  // (5–10MB each), so unbounded concurrency can OOM the process. The gate
  // processes at most N uploads at once and sheds overflow with 429.
  const MB = 1024 * 1024;
  const uploadGate = createUploadGate({ maxConcurrent: 8, maxQueued: 40 });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/logout', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  // Oversize requests are rejected before buffering; the gate bounds how
  // many in-flight uploads hold buffers simultaneously.
  app.use('/api/evidence/upload', rejectOversize(5 * MB));
  app.use('/api/storage/upload', rejectOversize(10 * MB));
  app.use('/api/profile/avatar', rejectOversize(5 * MB));
  app.use('/api/admin/branding/upload', rejectOversize(10 * MB));
  app.use('/api/landing-page/images', rejectOversize(10 * MB));
  app.use('/api/evidence/upload', uploadLimiter);
  app.use([
    '/api/evidence/upload',
    '/api/storage/upload',
    '/api/profile/avatar',
    '/api/admin/branding/upload',
    '/api/landing-page/images',
  ], uploadGate);
  app.use('/api', apiLimiter);

  // Express 4 does not forward rejections from async route handlers, which would
  // leave the client hanging on an unhandled error. Wrap every non-error handler
  // so a rejection is routed to the error middleware registered below.
  function wrapAsyncHandlers(router: express.Router) {
    const stack = (router as any).stack as any[];
    for (const layer of stack) {
      const route = layer?.route;
      if (route) {
        for (const h of route.stack) {
          const orig = h.handle;
          if (orig.length <= 3) {
            h.handle = ((fn: any) => (req: any, res: any, next: any) => {
              Promise.resolve(fn(req, res, next)).catch(next);
            })(orig);
          }
        }
      } else if (layer.handle && Array.isArray(layer.handle.stack)) {
        // Feature routers are mounted with router.use(...), so they appear as
        // stacked middleware (no `.route`). Recurse so their handlers get the
        // same async-rejection guard instead of leaving clients hanging.
        wrapAsyncHandlers(layer.handle);
      }
    }
    return router;
  }

  // Catch unhandled promise rejections globally
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled Rejection');
  });

  // CSRF defense for state-changing requests (cookies + double-submit token)
  app.use('/api', (req, res, next) => requireCsrf(req as AuthedRequest, res, next));

  // Idempotency for POST/PUT requests that supply an Idempotency-Key header.
  // Mounted after CSRF so replayed responses can never bypass the CSRF gate.
  app.use('/api', idempotencyMiddleware);

  // Domain REST + auth + SSE
  app.use("/api", wrapAsyncHandlers(createApiRouter()));
  app.use("/api", wrapAsyncHandlers(createAdminSettingsRouter()));
  app.use("/api/reference", wrapAsyncHandlers(createReferenceRouter()));

  // Unknown API paths return JSON 404 (registered before the Vite/SPA fallback
  // so the SPA index.html never serves unknown /api/* requests in dev).
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Vite emits content-hashed filenames under /assets — cache them
    // immutably for a year. Everything else (favicon, robots, sitemap) gets
    // a short revalidation window so deploys are picked up promptly.
    app.use(
      express.static(distPath, {
        etag: true,
        maxAge: 0,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else {
            res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
          }
        },
      })
    );
    // The SPA shell must always be revalidated so new deploys are picked up.
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Single error handler registered LAST so it receives errors from every
  // middleware/route above (including async rejections forwarded by
  // wrapAsyncHandlers and body-parser/helmet failures).
  app.use((err: any, _req: any, res: any, _next: any) => {
    logger.error({ err }, "Unhandled error");
    if (res.headersSent) return;
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "Request entity too large" });
      return;
    }
    const status = Number.isInteger(err.status) ? err.status : 500;
    const message = status >= 500 ? 'Internal server error' : (err.userMessage || 'An error occurred');
    res.status(status).json({ error: message });
  });

  startSlaJob(Number(process.env.SLA_CHECK_INTERVAL_MS) || 60_000);
  startEscalationJob(Number(process.env.ESCALATION_CHECK_INTERVAL_MS) || 120_000);

  // Cross-process SSE event bus (LISTEN/NOTIFY) so broadcasts reach clients
  // connected to the Next.js server during the transition and to other
  // replicas in multi-instance deployments.
  initEventBus();

  // Graceful shutdown handler
  let isShuttingDown = false;
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info('Server started');
  });

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received, starting graceful shutdown...');

    // Halt background jobs first so a scan cannot start mid-drain and write
    // after the process has begun exiting.
    stopSlaJob();
    stopEscalationJob();

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close all SSE connections gracefully
    closeAllSseConnections();
    logger.info('All SSE connections closed');

    // Wait for in-flight requests to complete (max 30 seconds)
    const shutdownTimeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30_000);
    shutdownTimeout.unref();

    // Give some time for in-flight requests
    await new Promise(resolve => setTimeout(resolve, 5000));

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();

