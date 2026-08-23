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
import { createLandingPageImagesRouter } from './routes/landingPageImages';
import { createWebhooksRouter } from './routes/webhooks';
import { createOrganizationsRouter } from './routes/organizations';
import { createIdentityRouter } from './routes/identity';
import { createTicketReferenceRouter } from './routes/ticketReference';
import { createWorkflowRouter } from './routes/workflow';
import { createEmailIngestRouter } from './routes/emailIngest';
import { createDocumentRouter } from './routes/documents';
import { createNotificationRouter } from './routes/notifications';
import { createTagsRouter } from './routes/tags';
import { createAnalyticsRouter } from './routes/analytics';
import { createSearchRouter } from './routes/search';
import { createPartnerPortalRouter } from './routes/partnerPortal';
import { createEscalationRouter } from './routes/escalation';
import { createSurveysRouter } from './routes/surveys';
import { createCopilotRouter } from './routes/copilot';

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
  router.use(createWebhooksRouter());
  router.use(createOrganizationsRouter());
  router.use(createIdentityRouter());
  router.use(createTicketReferenceRouter());
  router.use(createWorkflowRouter());
  router.use(createEmailIngestRouter());
  router.use(createDocumentRouter());
  router.use(createNotificationRouter());
  router.use(createTagsRouter());
  router.use(createAnalyticsRouter());
  router.use(createSearchRouter());
  router.use(createPartnerPortalRouter());
  router.use(createEscalationRouter());
  router.use(createSurveysRouter());
  router.use(createCopilotRouter());
  router.use('/landing-page', createLandingPageImagesRouter());
  return router;
}

