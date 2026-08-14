import { api } from './api';

/**
 * Wrapper that executes a promise and properly propagates errors.
 * Unlike the old safeSync which swallowed errors, this throws on failure
 * so callers can handle errors appropriately. For fire-and-forget callers,
 * errors will be logged to console.
 */
async function withErrorLogging(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (err: unknown) {
    console.error('[4C sync] failed:', (err as Error)?.message || err);
    throw err;
  }
}

/**
 * Fire-and-forget wrapper that catches errors internally to prevent
 * unhandled promise rejections. Use for calls where the result isn't
 * awaited and you just want to ensure errors are logged.
 */
function fireAndForget(promise: Promise<unknown>): void {
  promise.catch((err: unknown) => {
    console.error('[4C sync] fire-and-forget failed:', (err as Error)?.message || err);
  });
}

export async function syncTicketDelete(id: string) {
  try {
    return await api.deleteTicket(id);
  } catch (err: unknown) {
    console.error('[4C sync] delete ticket failed:', (err as Error)?.message || err);
    throw err;
  }
}

export async function syncTicketUpdate(id: string, patch: unknown) {
  try {
    return await api.updateTicket(id, patch);
  } catch (err: unknown) {
    console.error('[4C sync] update ticket failed:', (err as Error)?.message || err);
    throw err;
  }
}

export async function syncTicketTransition(id: string, status: string) {
  try {
    return await api.transitionTicket(id, status);
  } catch (err: unknown) {
    console.error('[4C sync] transition ticket failed:', (err as Error)?.message || err);
    throw err;
  }
}

export function syncFeedback(id: string, patch: { feedbackScore?: number | null; feedbackComment?: string | null }) {
  fireAndForget(withErrorLogging(api.submitFeedback(id, patch)));
}

export function syncCreateTicket(ticket: unknown) {
  fireAndForget(withErrorLogging(api.createTicket(ticket)));
}

export function syncComment(comment: unknown) {
  fireAndForget(withErrorLogging(api.createComment(comment)));
}

export function syncAudit(entry: { ticketId?: string | null; action: string; details: string }) {
  fireAndForget(withErrorLogging(api.createAudit(entry)));
}

export function syncNotification(n: unknown) {
  fireAndForget(withErrorLogging(api.createNotification(n)));
}

export function syncNotificationRead(id: string) {
  fireAndForget(withErrorLogging(api.markNotificationRead(id)));
}

export function syncConfig(key: string, value: unknown) {
  fireAndForget(withErrorLogging(api.putConfig(key, value)));
}

export function syncSlaRules(items: unknown[]) {
  fireAndForget(withErrorLogging(api.putSlaRules(items)));
}

export function syncHolidays(items: unknown[]) {
  fireAndForget(withErrorLogging(api.putHolidays(items)));
}

export function syncTemplates(items: unknown[]) {
  fireAndForget(withErrorLogging(api.putTicketTemplates(items)));
}

export function syncKbArticles(items: unknown[]) {
  fireAndForget(withErrorLogging(api.putKbArticles(items)));
}

export function syncCustomerCreate(c: unknown) {
  fireAndForget(withErrorLogging(api.createCustomer(c)));
}

export function syncCustomerUpdate(id: string, c: unknown) {
  fireAndForget(withErrorLogging(api.updateCustomer(id, c)));
}

export async function syncCustomerDelete(id: string) {
  await api.deleteCustomer(id);
}

export function syncMajorIncident(mi: unknown) {
  fireAndForget(withErrorLogging(api.createMajorIncident(mi)));
}

export function syncMajorIncidentUpdate(id: string, patch: unknown) {
  fireAndForget(withErrorLogging(api.updateMajorIncident(id, patch)));
}

export async function syncEvidenceUpload(ticketId: string, file: File) {
  try {
    const ev = await api.uploadEvidence(ticketId, file, file.name, file.type);
    return ev;
  } catch (err: unknown) {
    console.error('[4C sync] evidence upload failed:', (err as Error)?.message || err);
    return null;
  }
}

export async function syncReferenceCreate(kind: string, item: unknown) {
  try {
    return await api.createReference(kind, item);
  } catch (err: unknown) {
    console.error(`[4C sync] create ${kind} failed:`, (err as Error)?.message || err);
    throw err;
  }
}

export async function syncReferenceUpdate(kind: string, id: string, patch: unknown) {
  try {
    return await api.updateReference(kind, id, patch);
  } catch (err: unknown) {
    console.error(`[4C sync] update ${kind} failed:`, (err as Error)?.message || err);
    throw err;
  }
}

export async function syncReferenceDelete(kind: string, id: string) {
  try {
    return await api.deleteReference(kind, id);
  } catch (err: unknown) {
    console.error(`[4C sync] delete ${kind} failed:`, (err as Error)?.message || err);
    throw err;
  }
}
