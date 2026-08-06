import express from "express";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
// Load env BEFORE anything else, since server/ modules throw at import time
// if SUPABASE_* are absent. `import 'dotenv/config'` runs during ESM
// import evaluation (hoisted first), ahead of downstream server/ imports.
import "dotenv/config";
import { seedDatabase } from "./server/seed";
import { createApiRouter } from "./server/routes";
import { createAdminSettingsRouter } from "./server/routes/adminSettings";
import { createReferenceRouter } from "./server/routes/reference";
import { startSlaJob } from "./server/slaJob";
import { requireAuth, requireCsrf, type AuthedRequest } from "./server/auth";
import { logger, requestIdMiddleware } from "./server/logger";
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
  
  // Validate JWT_SECRET strength (must be at least 32 characters)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for security');
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
  // Dev seeding must NEVER run in production: the seed creates known-password
  // demo accounts (password123) that would be a credential backdoor. Dev data
  // is only inserted when explicitly requested for a non-production environment.
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const seeded = await seedDatabase();
    if (seeded) {
      console.warn('DEV-ONLY: seeded demo data. Demo accounts MUST NOT exist in production.');
    }
  }

  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  app.use(express.json({ limit: "5mb", strict: false }));

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
      maxAge: 15552000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // Deny access to browser features the SPA never uses (defense-in-depth;
  // helmet v8 does not emit Permissions-Policy itself).
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), battery=(), gamepad=()'
    );
    next();
  });

  // Health check — registered before the API limiter/CSRF so probes are never
  // throttled or require a session.
  app.get("/api/health", async (_req, res) => {
    const health = {
      ok: true,
      uptime: process.uptime(),
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


  // Rate limiting — general API
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300,
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

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/evidence/upload', uploadLimiter);
  app.use('/api', apiLimiter);

  // Express 4 does not forward rejections from async route handlers, which would
  // leave the client hanging on an unhandled error. Wrap every non-error handler
  // so a rejection is routed to the error middleware registered below.
  function wrapAsyncHandlers(router: express.Router) {
    const stack = (router as any).stack as any[];
    for (const layer of stack) {
      const route = layer?.route;
      if (!route) continue;
      for (const h of route.stack) {
        const orig = h.handle;
        if (orig.length <= 3) {
          h.handle = ((fn: any) => (req: any, res: any, next: any) => {
            Promise.resolve(fn(req, res, next)).catch(next);
          })(orig);
        }
      }
    }
    return router;
  }

  // Catch unhandled promise rejections globally
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled Rejection');
  });

  // Initialize Gemini client on server-side
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // CSRF defense for state-changing requests (cookies + double-submit token)
  app.use('/api', (req, res, next) => requireCsrf(req as AuthedRequest, res, next));

  // Domain REST + auth + SSE
  app.use("/api", wrapAsyncHandlers(createApiRouter()));
  app.use("/api", wrapAsyncHandlers(createAdminSettingsRouter()));
  app.use("/api/reference", wrapAsyncHandlers(createReferenceRouter()));

  // ── Gemini routes (authenticated) ─────────────────────────────
  // AI calls are a paid external dependency and easy to abuse: rate-limit per
  // IP and enforce a rolling per-user request budget so no single session can
  // drain provider quota.
  const AI_BUDGET_WINDOW_MS = 15 * 60 * 1000;
  const AI_MAX_PER_USER = 30;
  const aiUserUsage = new Map<string, { windowStart: number; count: number }>();
  function takeAiBudget(userId: string): boolean {
    const now = Date.now();
    const entry = aiUserUsage.get(userId);
    if (!entry || now - entry.windowStart >= AI_BUDGET_WINDOW_MS) {
      aiUserUsage.set(userId, { windowStart: now, count: 1 });
      return true;
    }
    if (entry.count >= AI_MAX_PER_USER) return false;
    entry.count += 1;
    return true;
  }
  const aiIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests, please try again later.' },
  });

  const ALLOWED_GEMINI_MODELS = new Set([
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
  ]);
  const validModel = (m: unknown): string | null =>
    typeof m === 'string' && ALLOWED_GEMINI_MODELS.has(m) ? m : null;

  // CAPTCHA-free AI budget middleware (authenticated routes only).
  const aiBudgetGuard = (req: AuthedRequest, res: any, next: any) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
    if (!takeAiBudget(req.user.id)) {
      return res.status(429).json({ error: `AI usage limit reached (${AI_MAX_PER_USER}/15 min). Please try again later.` });
    }
    next();
  };

  app.post("/api/gemini/analyze", requireAuth, aiIpLimiter, aiBudgetGuard, async (req, res) => {
    try {
      const { prompt, systemInstruction, modelName } = req.body;
      // Pinned model allow-list — clients may not request an arbitrary model.
      const model = validModel(modelName) || "gemini-3.5-flash";

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      res.json({ success: true, text: response.text });
    } catch (error: any) {
      logger.error({ err: error }, "Gemini API Error");
      res.status(500).json({ success: false, error: error.message || "Failed to query Gemini AI" });
    }
  });

  app.post("/api/gemini/classify", requireAuth, aiIpLimiter, aiBudgetGuard, async (req, res) => {
    try {
      const { description, categories } = req.body;
      const categoriesJsonStr = JSON.stringify(categories, null, 2);

      const prompt = `You are an AI payment dispatch bot. Your job is to classify the payment incident complaint description, map it to a category and sub-issue type, and recommend the best provider based on historical resolution efficiency.

INCIDENT DESCRIPTION:
"${description}"

AVAILABLE CATEGORIES AND SUB-TYPES MAP:
${categoriesJsonStr}

HISTORICAL PROVIDER EFFICIENCY RULES (Based on historical resolution speed and success rate):
1. **Parkway**: Highest efficiency (98% success, MTTR: 1.5 hours) for "Duplicate Debit" and "Reversal Error". Slow for terminal issues.
2. **Adyen**: Best for high-value "Settlement Delay" and cross-border settlement (92% success, MTTR: 4.0 hours).
3. **PayPal**: Premium support for hardware terminal issues ("Merchant Issue", "POS Terminal Timeout") (94% success, MTTR: 1.8 hours).
4. **Braintree**: Versatile support for general payment gateways, custom APIs, and callback notifications (89% success, MTTR: 3.0 hours).

Analyze the incident. Map it to one of the available Categories and one of its corresponding Sub-Issue Types. Pick the highest matching priority (CRITICAL, HIGH, MEDIUM, LOW) based on the financial severity or customer friction. Pick the best provider based on historical provider efficiency rules. Provide a 1-2 sentence professional reasoning explanation of why you classified it this way and recommended that provider.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              issueType: { type: Type.STRING },
              priority: { type: Type.STRING },
              provider: { type: Type.STRING },
              reasoning: { type: Type.STRING },
            },
            required: ["category", "issueType", "priority", "provider", "reasoning"],
          },
        },
      });

      res.json({ success: true, data: JSON.parse(response.text || "{}") });
    } catch (error: any) {
      logger.error({ err: error }, "Gemini Classify Error");
      res.status(500).json({ success: false, error: error.message || "Failed to classify ticket" });
    }
  });

  app.post("/api/gemini/rca", requireAuth, aiIpLimiter, aiBudgetGuard, async (req, res) => {
    try {
      const { ticketDetails } = req.body;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Analyze this payment dispute complaint and generate structural Root Cause Analysis fields.
Ticket ID: ${ticketDetails.id}
Category: ${ticketDetails.category}
Sub-type: ${ticketDetails.issueType}
Provider: ${ticketDetails.provider}
Business Unit: ${ticketDetails.bu}
Description: ${ticketDetails.description}

Generate realistic and professional values for:
1. Root Cause Summary (detailed investigation of the failure vector)
2. Contributing Factors (such as network congestion, API timeout, etc.)
3. Corrective Actions (immediate mitigation steps performed)
4. Preventive Actions (long-term engineering/process safeguards)
5. Owner of Preventive Actions (appropriate department or role)
6. Due Date (YYYY-MM-DD format, roughly 14 days from today)`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rootCauseSummary: { type: Type.STRING },
              contributingFactors: { type: Type.STRING },
              correctiveActions: { type: Type.STRING },
              preventiveActions: { type: Type.STRING },
              preventiveOwner: { type: Type.STRING },
              preventiveDueDate: { type: Type.STRING },
            },
            required: [
              "rootCauseSummary",
              "contributingFactors",
              "correctiveActions",
              "preventiveActions",
              "preventiveOwner",
              "preventiveDueDate",
            ],
          },
        },
      });

      res.json({ success: true, data: JSON.parse(response.text || "{}") });
    } catch (error: any) {
      logger.error({ err: error }, "Gemini RCA Error");
      res.status(500).json({ success: false, error: error.message || "Failed to generate structured RCA" });
    }
  });

  app.post("/api/gemini/chat", requireAuth, aiIpLimiter, aiBudgetGuard, async (req: AuthedRequest, res) => {
    try {
      const { message, history } = req.body;

      let chatPrompt = "";
      if (history && history.length > 0) {
        history.forEach((h: any) => {
          chatPrompt += `${h.role === "user" ? "User" : "Assistant"}: ${h.text}\n`;
        });
      }
      chatPrompt += `User: ${message}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: chatPrompt,
        config: {
          systemInstruction:
            "You are an elite, ISO 10002-compliant Lead Financial Support and Payment Operations Engineer at 4CoreFinSupport. You specialize in investigating payment incidents, transaction settlement latency, API timeouts, clearing network chargebacks, and gateway reconciliations across providers (Parkway, PayPal, Adyen, Braintree). Help internal teams and payment providers collaborate to resolve incidents quickly. Keep responses professional, highly precise, concise, and focused on payment operations.",
        },
      });

      res.json({ success: true, text: response.text });
    } catch (error: any) {
      logger.error({ err: error }, "Gemini Chat Error");
      res.status(500).json({ success: false, error: error.message || "Failed to get chatbot response" });
    }
  });

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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
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
    const message =
      process.env.NODE_ENV === "production" && status === 500
        ? "Internal server error"
        : err.message || "Internal server error";
    res.status(status).json({ error: message });
  });

  startSlaJob(Number(process.env.SLA_CHECK_INTERVAL_MS) || 60_000);

  // Graceful shutdown handler
  let isShuttingDown = false;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received, starting graceful shutdown...');

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

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, "Unhandled Rejection");
  });
}

startServer();

