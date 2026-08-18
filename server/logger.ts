import pino from 'pino';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type { AuthUser } from './compliance';

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation
  namespace Express {
    interface Request {
      id?: string;
      log?: pino.Logger;
      user?: AuthUser;
    }
  }
}

/**
 * Configure Pino logger
 */
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

export const logger = pino({
  level: logLevel,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({
      service: '4corefinsupport',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      hostname: process.env.HOSTNAME || 'localhost',
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: undefined, // Don't include pid, hostname in every log
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.passwordHash',
      'req.body.oldPassword',
      'req.body.newPassword',
      'req.body.token',
      'req.body.secret',
      'req.body.apiKey',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  },
});

/**
 * Create child logger with context
 */
export function createContextLogger(context: Record<string, any>): pino.Logger {
  return logger.child(context);
}

/**
 * Request ID middleware - adds unique request ID and child logger
 * Must be added early in middleware chain (after helmet, before routes)
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Generate or extract request ID
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Create child logger with request context
  const userId = req.user?.id || req.user?.sub || 'anonymous';
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string || 'unknown';

  req.log = logger.child({
    requestId,
    userId,
    tenantId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  // Log request start
  req.log.debug({ query: req.query, params: req.params }, 'Request started');

  // Log response on finish
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log[logLevel](
      {
        statusCode: res.statusCode,
        durationMs: duration,
        contentLength: res.getHeader('content-length'),
      },
      'Request completed'
    );
  });

  next();
}

/**
 * Error logging helper
 */
export function logError(req: Request | undefined, error: Error, context?: Record<string, any>) {
  const log = req?.log || logger;
  log.error(
    {
      err: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    },
    'Application error'
  );
}

/**
 * Audit log helper (separate from application logs)
 */
export function logAudit(
  action: string,
  details: string,
  context: {
    userId?: string;
    tenantId?: string;
    ticketId?: string;
    resourceType?: string;
    resourceId?: string;
    outcome: 'success' | 'failure' | 'error';
    metadata?: Record<string, any>;
  }
) {
  logger.info(
    {
      audit: true,
      action,
      details,
      ...context,
      timestamp: new Date().toISOString(),
    },
    'Audit event'
  );
}

/**
 * Security event logging
 */
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  context: {
    userId?: string;
    tenantId?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    details?: string;
    metadata?: Record<string, any>;
  }
) {
  const logLevel = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  logger[logLevel](
    {
      security: true,
      event,
      severity,
      ...context,
      timestamp: new Date().toISOString(),
    },
    `Security event: ${event}`
  );
}

/**
 * Performance timing helper
 */
export function createTimer(label: string) {
  const start = process.hrtime.bigint();
  return {
    end: (meta?: Record<string, any>) => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.debug({ label, durationMs, ...meta }, `Timer: ${label}`);
      return durationMs;
    },
  };
}