// Re-export all repository functions for backward compatibility.
// Individual modules live in ./repositories/ for maintainability.

export { dispatchWebhook, registerDeliveryAttempt } from './services/webhookDispatcher';

// Shared helpers
export {
  tenantScope,
  isPartner,
  partnerNameFor,
  scopeTicketsToPartner,
  toCamel,
  toSnake,
  tryDecrypt,
  ticketTenantId,
  ensureTenantForBu,
  resolvePartnerOrgId,
} from './repositories/shared';

// Tickets
export {
  listTickets,
  getTicketRaw,
  getScopedTicket,
  getTicket,
  ticketEventFields,
  upsertTicket,
  nextTicketSequence,
  recalcCustomerTotalTickets,
  ticketFacetCounts,
  openTicketsForSla,
} from './repositories/ticketRepository';

// Comments
export {
  listComments,
  insertComment,
  updateComment,
  getScopedComment,
} from './repositories/commentRepository';

// Audit Logs
export {
  getLatestAuditHash,
  appendAuditLog,
  listAuditLogs,
  listAuditLogsForVerification,
  verifyAuditChainPaged,
} from './repositories/auditLogRepository';

// Notifications
export {
  listNotifications,
  insertNotification,
  markNotificationRead,
} from './repositories/notificationRepository';

// Evidence
export {
  listEvidence,
  getEvidenceById,
  insertEvidence,
  deleteEvidence,
} from './repositories/evidenceRepository';

// Major Incidents
export {
  listMajorIncidents,
  getScopedMajorIncident,
  upsertMajorIncident,
  linkTicketToMajorIncident,
} from './repositories/majorIncidentRepository';

// Customers
export {
  listCustomers,
  upsertCustomer,
  deleteCustomer,
  getScopedCustomer,
  findOrCreateCustomer,
  countTicketsByCustomer,
} from './repositories/customerRepository';

// Users
export {
  listUsersPublic,
  upsertUser,
  deleteUser,
} from './repositories/userRepository';

// Config
export {
  clearConfigCache,
  getConfig,
  setConfig,
  countTicketsByBu,
  countTicketsByPartner,
  countTicketsByCategory,
  countUsersByBu,
  countActiveTicketsByCategoryAndPriority,
  categoryExists,
  listConfigItems,
  addConfigItem,
  updateConfigItem,
  removeConfigItem,
  listCustomReferenceKinds,
  addCustomReferenceKind,
  type CustomReferenceKind,
} from './repositories/configRepository';

// JSON Tables & Business Hours
export {
  listJsonTable,
  replaceJsonTable,
  insertJsonTableRow,
  updateJsonTableRow,
  deleteJsonTableRow,
  listBusinessHours,
  upsertBusinessHours,
} from './repositories/jsonTableRepository';
