import { api } from './api';

async function safeSync(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise;
    return true;
  } catch (err: unknown) {
    console.warn('[4C sync] failed:', (err as Error)?.message || err);
    return false;
  }
}

export function syncTicketPatch(id: string, patch: unknown) {
  return safeSync(api.updateTicket(id, patch));
}

export function syncFeedback(id: string, patch: { feedbackScore?: number | null; feedbackComment?: string | null }) {
  return safeSync(api.submitFeedback(id, patch));
}

export function syncCreateTicket(ticket: unknown) {
  return safeSync(api.createTicket(ticket));
}

export function syncComment(comment: unknown) {
  return safeSync(api.createComment(comment));
}

export function syncAudit(entry: { ticketId?: string | null; action: string; details: string }) {
  return safeSync(api.createAudit(entry));
}

export function syncNotification(n: unknown) {
  return safeSync(api.createNotification(n));
}

export function syncNotificationRead(id: string) {
  return safeSync(api.markNotificationRead(id));
}

export function syncConfig(key: string, value: unknown) {
  return safeSync(api.putConfig(key, value));
}

export function syncSlaRules(items: unknown[]) {
  return safeSync(api.putSlaRules(items));
}

export function syncHolidays(items: unknown[]) {
  return safeSync(api.putHolidays(items));
}

export function syncTemplates(items: unknown[]) {
  return safeSync(api.putTicketTemplates(items));
}

export function syncKbArticles(items: unknown[]) {
  return safeSync(api.putKbArticles(items));
}

export function syncCustomerCreate(c: unknown) {
  return safeSync(api.createCustomer(c));
}

export function syncCustomerUpdate(id: string, c: unknown) {
  return safeSync(api.updateCustomer(id, c));
}

export async function syncCustomerDelete(id: string) {
  await api.deleteCustomer(id);
}

export function syncMajorIncident(mi: unknown) {
  return safeSync(api.createMajorIncident(mi));
}

export function syncMajorIncidentUpdate(id: string, patch: unknown) {
  return safeSync(api.updateMajorIncident(id, patch));
}

export async function syncEvidenceUpload(ticketId: string, file: File) {
  try {
    const ev = await api.uploadEvidence(ticketId, file, file.name, file.type);
    return ev;
  } catch (err: unknown) {
    console.warn('[4C sync] evidence upload failed:', (err as Error)?.message || err);
    return null;
  }
}

export async function syncReferenceCreate(kind: string, item: unknown) {
  try {
    return await api.createReference(kind, item);
  } catch (err: unknown) {
    console.warn(`[4C sync] create ${kind} failed:`, (err as Error)?.message || err);
    throw err;
  }
}

export async function syncReferenceUpdate(kind: string, id: string, patch: unknown) {
  try {
    return await api.updateReference(kind, id, patch);
  } catch (err: unknown) {
    console.warn(`[4C sync] update ${kind} failed:`, (err as Error)?.message || err);
    throw err;
  }
}

export async function syncReferenceDelete(kind: string, id: string) {
  try {
    return await api.deleteReference(kind, id);
  } catch (err: unknown) {
    console.warn(`[4C sync] delete ${kind} failed:`, (err as Error)?.message || err);
    throw err;
  }
}
