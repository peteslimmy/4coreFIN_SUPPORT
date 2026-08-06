import { Router } from 'express';
import { createAuthSessionsRouter } from './routes/authSessions';
import { createTicketsRouter } from './routes/tickets';
import { createEvidenceRouter } from './routes/evidence';
import { createCommentsRouter } from './routes/comments';
import { createAuditRouter } from './routes/audit';
import { createUsersRouter } from './routes/users';
import { createCustomersRouter } from './routes/customers';
import { createConfigRouter } from './routes/config';
import { createOperationsRouter } from './routes/operations';
import { createProfileRouter } from './routes/profile';

// Re-export the magic-byte MIME sniffer so tests can exercise it directly.
export { sniffMimeType } from './routes/evidence';

/**
 * Aggregate router mounting every feature router under /api.
 * Mount order matters: more specific path templates must be registered before
 * param-matched siblings, but feature routers keep their paths scoped so no
 * cross-router collisions occur.
 */
export function createApiRouter(): Router {
  const router = Router();
  router.use(createAuthSessionsRouter());
  router.use(createTicketsRouter());
  router.use(createEvidenceRouter());
  router.use(createCommentsRouter());
  router.use(createAuditRouter());
  router.use(createUsersRouter());
  router.use(createCustomersRouter());
  router.use(createConfigRouter());
  router.use(createOperationsRouter());
  router.use(createProfileRouter());
  return router;
}

