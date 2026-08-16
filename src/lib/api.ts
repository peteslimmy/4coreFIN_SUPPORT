import type {
  AuditLog,
  CommentRecord,
  CustomerRecord,
  FileEvidence,
  MajorIncidentRecord,
  TicketRecord,
  WatcherNotification,
} from '../types/app';
import type {
  CategoryRecord,
  HolidayRecord,
  KbArticle,
  SlaRule,
  TicketTemplate,
  UserRecord,
} from '../types/admin';
import type { BuFormConfig } from '../types/forms';
import type { RoleDefinition } from '../types/rbac';

export interface BootstrapData {
  tickets?: TicketRecord[];
  comments?: CommentRecord[];
  auditLogs?: AuditLog[];
  watcherNotifications?: WatcherNotification[];
  majorIncidents?: MajorIncidentRecord[];
  users?: UserRecord[];
  slaRules?: SlaRule[];
  holidays?: HolidayRecord[];
  ticketTemplates?: TicketTemplate[];
  kbArticles?: KbArticle[];
  customers?: CustomerRecord[];
  savedReplies?: string[];
  businessUnits?: string[];
  businessUnitCodes?: Record<string, string>;
  paymentChannels?: string[];
  partners?: string[];
  categories?: CategoryRecord[];
  buFormConfigs?: BuFormConfig[];
  roles?: RoleDefinition[];
  evidence?: FileEvidence[];
  notificationConfigs?: unknown[];
}

export interface ApiListOptions {
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

export const SESSION_COOKIE = '4c_session';
export const CSRF_COOKIE = '4c_csrf';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = name + '=';
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return part.slice(prefix.length);
      }
    }
  }
  return null;
}

/** True when a server-side session cookie is present. */
export function hasSession(): boolean {
  return getCookie(CSRF_COOKIE) !== null;
}

export function getCsrfToken(): string | null {
  return getCookie(CSRF_COOKIE);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * fetch wrapper that authenticates via the httpOnly session cookie (sent by
 * the browser for same-origin requests) and attaches the CSRF token for
 * state-changing requests.
 */
export async function authorizedFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const csrf = getCsrfToken();
  if (csrf && !SAFE_METHODS.has(method)) {
    headers.set('X-CSRF-Token', csrf);
  }
  return fetch(path, { ...options, headers, credentials: 'same-origin' });
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await authorizedFetch(path, { ...options, headers });
  if (res.status === 401 && hasSession()) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<{ user: UserRecord & { name?: string }; mustChangePassword?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),

  me: () => apiFetch<{ user: UserRecord & { name?: string }; mustChangePassword?: boolean }>('/api/auth/me'),

  bootstrap: (scope?: string[]) => {
    const qs = scope?.length ? `?scope=${scope.join(',')}` : '';
    return apiFetch<BootstrapData>(`/api/bootstrap${qs}`);
  },

  listTickets: (filters?: Record<string, unknown>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters || {})) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    return apiFetch<TicketRecord[]>(`/api/tickets${qs ? `?${qs}` : ''}`);
  },

  getTicket: (id: string) => apiFetch<TicketRecord>(`/api/tickets/${encodeURIComponent(id)}`),

  createTicket: (ticket: unknown) =>
    apiFetch<TicketRecord>('/api/tickets', { method: 'POST', body: JSON.stringify(ticket) }),

  updateTicket: (id: string, patch: unknown) =>
    apiFetch<TicketRecord>(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  transitionTicket: (id: string, status: string) =>
    apiFetch<TicketRecord>(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  listComments: (ticketId: string) =>
    apiFetch<CommentRecord[]>(`/api/tickets/${encodeURIComponent(ticketId)}/comments`),

  submitFeedback: (id: string, patch: unknown) =>
    apiFetch<TicketRecord>(`/api/tickets/${id}/feedback`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteTicket: (id: string) => apiFetch(`/api/tickets/${id}`, { method: 'DELETE' }),

  createComment: (comment: unknown) =>
    apiFetch<CommentRecord>('/api/comments', { method: 'POST', body: JSON.stringify(comment) }),

  listMajorIncidents: (filters?: Record<string, unknown>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters || {})) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    return apiFetch<MajorIncidentRecord[]>(`/api/major-incidents${qs ? `?${qs}` : ''}`);
  },

  getMajorIncident: (id: string) =>
    apiFetch<MajorIncidentRecord>(`/api/major-incidents/${encodeURIComponent(id)}`),

  listCustomers: (filters?: Record<string, unknown>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters || {})) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    return apiFetch<CustomerRecord[]>(`/api/customers${qs ? `?${qs}` : ''}`);
  },

  getCustomer: (id: string) =>
    apiFetch<CustomerRecord>(`/api/customers/${encodeURIComponent(id)}`),

  listAuditLogs: (limit = 500) =>
    apiFetch<AuditLog[]>(`/api/audit-log?limit=${limit}`),

  listNotifications: (recipient?: string) => {
    const params = new URLSearchParams();
    if (recipient) params.set('recipient', recipient);
    const qs = params.toString();
    return apiFetch<WatcherNotification[]>(`/api/notifications${qs ? `?${qs}` : ''}`);
  },

  listUsers: () => apiFetch<UserRecord[]>('/api/users'),

  getConfig: <T>(key: string, fallback: T) =>
    apiFetch(`/api/config/${encodeURIComponent(key)}`).then((data) => {
      if (data != null && typeof data === 'object' && 'value' in data) return (data as { value: T }).value;
      return (data as T) ?? fallback;
    }),

  getFormConfigs: (bu?: string) => {
    const params = new URLSearchParams();
    if (bu) params.set('bu', bu);
    const qs = params.toString();
    return apiFetch<BuFormConfig[]>(`/api/form-configs${qs ? `?${qs}` : ''}`);
  },

  listEvidence: (ticketIds?: string[]) => {
    const params = new URLSearchParams();
    (ticketIds || []).forEach((id) => params.append('ticketId', id));
    const qs = params.toString();
    return apiFetch<FileEvidence[]>(`/api/evidence${qs ? `?${qs}` : ''}`);
  },

  deleteEvidence: (id: string) =>
    apiFetch(`/api/evidence/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createAudit: (entry: { ticketId?: string | null; action: string; details: string }) =>
    apiFetch('/api/audit-log', { method: 'POST', body: JSON.stringify(entry) }),

  verifyAudit: () => apiFetch<{ valid: boolean; brokenIndex: number | null }>('/api/audit-log/verify'),

  createNotification: (n: unknown) =>
    apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify(n) }),

  markNotificationRead: (id: string) =>
    apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  createMajorIncident: (mi: unknown) =>
    apiFetch<MajorIncidentRecord>('/api/major-incidents', { method: 'POST', body: JSON.stringify(mi) }),

  updateMajorIncident: (id: string, patch: unknown) =>
    apiFetch<MajorIncidentRecord>(`/api/major-incidents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  retryMajorIncidentNotification: (id: string, notifId: string) =>
    apiFetch<MajorIncidentRecord>(`/api/major-incidents/${encodeURIComponent(id)}/notifications/${encodeURIComponent(notifId)}/retry`, { method: 'POST' }),

  createCustomer: (c: unknown) =>
    apiFetch<CustomerRecord>('/api/customers', { method: 'POST', body: JSON.stringify(c) }),

  updateCustomer: (id: string, patch: unknown) =>
    apiFetch<CustomerRecord>(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteCustomer: (id: string) => apiFetch(`/api/customers/${id}`, { method: 'DELETE' }),

  createUser: (u: unknown) => apiFetch('/api/users', { method: 'POST', body: JSON.stringify(u) }),
  updateUser: (id: string, u: unknown) =>
    apiFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(u) }),
  deleteUser: (id: string) => apiFetch(`/api/users/${id}`, { method: 'DELETE' }),
  toggleUserActivation: (id: string, isActive: boolean) =>
    apiFetch(`/api/users/${id}/activation`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  generateTempPassword: () =>
    apiFetch<{ password: string }>('/api/users/generate-password', { method: 'POST' }),
  resendUserInvite: (id: string) =>
    apiFetch<{ ok: boolean; invitationSent?: boolean; tempPassword?: string }>(`/api/users/${id}/resend-invite`, { method: 'POST' }),

  putSlaRules: (items: unknown[]) =>
    apiFetch('/api/config/sla_rules', { method: 'PUT', body: JSON.stringify(items) }),
  putHolidays: (items: unknown[]) =>
    apiFetch('/api/config/holidays', { method: 'PUT', body: JSON.stringify(items) }),
  putTicketTemplates: (items: unknown[]) =>
    apiFetch('/api/config/ticket_templates', { method: 'PUT', body: JSON.stringify(items) }),
  putKbArticles: (items: unknown[]) =>
    apiFetch('/api/config/kb_articles', { method: 'PUT', body: JSON.stringify(items) }),

  putConfig: (key: string, value: unknown) =>
    apiFetch(`/api/config/${key}`, { method: 'PUT', body: JSON.stringify(value) }),

  listReference: (kind: string) => apiFetch<unknown[]>(`/api/reference/${kind}`),
  createReference: (kind: string, item: unknown) =>
    apiFetch(`/api/reference/${kind}`, { method: 'POST', body: JSON.stringify(item) }),
  updateReference: (kind: string, id: string, patch: unknown) =>
    apiFetch(`/api/reference/${kind}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteReference: (kind: string, id: string) =>
    apiFetch(`/api/reference/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listReferenceKinds: () => apiFetch<unknown[]>('/api/reference/kinds'),
  createReferenceKind: (def: unknown) =>
    apiFetch('/api/reference/kinds', { method: 'POST', body: JSON.stringify(def) }),

  uploadEvidence: (ticketId: string, blob: Blob, fileName: string, fileType: string) =>
    apiFetch<FileEvidence>('/api/evidence/upload', {
      method: 'POST',
      headers: {
        'Content-Type': fileType,
        'x-ticket-id': ticketId,
        'x-filename': fileName,
      },
      body: blob,
    }),

  geminiChat: (message: string, history: unknown[]) =>
    apiFetch('/api/gemini/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),

  geminiAnalyze: (body: unknown) =>
    apiFetch('/api/gemini/analyze', { method: 'POST', body: JSON.stringify(body) }),

  geminiRca: (ticketDetails: unknown) =>
    apiFetch('/api/gemini/rca', { method: 'POST', body: JSON.stringify({ ticketDetails }) }),

  geminiClassify: (description: string, categories: unknown) =>
    apiFetch('/api/gemini/classify', {
      method: 'POST',
      body: JSON.stringify({ description, categories }),
    }),
};

/**
 * Open an authenticated SSE connection (via session cookie) that
 * transparently reconnects with exponential backoff after network drops or
 * server restarts. Returns a disposer that stops the reconnect loop.
 */
export function connectEvents(onEvent: (event: string, data: unknown) => void): () => void {
  if (!hasSession()) return () => {};

  const controller = new AbortController();
  let stopped = false;
  let attempt = 0;

  const run = async () => {
    while (!stopped) {
      let buffer = '';
      try {
        const res = await fetch('/api/events', {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE stream unavailable (${res.status})`);
        attempt = 0; // a healthy stream resets the backoff ladder
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let eventName = 'message';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() || '';
          for (const line of parts) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              const raw = line.slice(5).trim();
              try {
                onEvent(eventName, JSON.parse(raw || '{}'));
              } catch {
                onEvent(eventName, raw);
              }
              eventName = 'message';
            }
          }
        }
        // Stream ended without error — reconnect immediately on next loop.
      } catch (e: unknown) {
        const err = e as Error;
        if (stopped || err?.name === 'AbortError') return;
        if (import.meta.env.DEV) {
          console.warn('SSE disconnected, reconnecting…', err);
        }
      }
      if (stopped) return;
      attempt += 1;
      // 2s, 4s, 8s, 16s, 30s cap — a blip recovers quickly; an outage
      // backs off instead of hammering the server.
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };

  void run();

  return () => {
    stopped = true;
    controller.abort();
  };
}
