import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Query keys factory for consistent key management
 */
export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  tickets: {
     all: (filters?: Record<string, unknown>) => ['tickets', filters] as const,
    detail: (id: string) => ['tickets', 'detail', id] as const,
    comments: (ticketId: string) => ['tickets', ticketId, 'comments'] as const,
    evidence: (ticketId: string) => ['tickets', ticketId, 'evidence'] as const,
    risk: (id: string) => ['tickets', id, 'risk'] as const,
  },
  comments: {
    all: () => ['comments'] as const,
  },
  majorIncidents: {
     all: (filters?: Record<string, unknown>) => ['majorIncidents', filters] as const,
    detail: (id: string) => ['majorIncidents', 'detail', id] as const,
  },
  customers: {
     all: (filters?: Record<string, unknown>) => ['customers', filters] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  auditLogs: {
    all: (limit?: number) => ['auditLogs', limit] as const,
    verify: () => ['auditLogs', 'verify'] as const,
  },
  notifications: {
    all: (recipient?: string) => ['notifications', recipient] as const,
  },
  users: {
    all: () => ['users'] as const,
  },
  config: {
    businessUnits: () => ['config', 'businessUnits'] as const,
    paymentChannels: () => ['config', 'paymentChannels'] as const,
    partners: () => ['config', 'partners'] as const,
    categories: () => ['config', 'categories'] as const,
    slaRules: () => ['config', 'slaRules'] as const,
    holidays: () => ['config', 'holidays'] as const,
    ticketTemplates: () => ['config', 'ticketTemplates'] as const,
    kbArticles: () => ['config', 'kbArticles'] as const,
    formConfigs: (bu?: string) => ['config', 'formConfigs', bu] as const,
    roles: () => ['config', 'roles'] as const,
    savedReplies: () => ['config', 'savedReplies'] as const,
    notificationConfigs: () => ['config', 'notificationConfigs'] as const,
    escalationRules: () => ['config', 'escalationRules'] as const,
    settings: () => ['config', 'settings'] as const,
  },
  evidence: {
    all: (ticketIds?: string[]) => ['evidence', ticketIds] as const,
  },
  rbac: {
    roles: () => ['rbac', 'roles'] as const,
  },
  ai: {
    classify: (description: string) => ['ai', 'classify', description] as const,
     rca: (ticketDetails: unknown) => ['ai', 'rca', ticketDetails] as const,
     chat: (message: string, history: unknown[]) => ['ai', 'chat', message, history] as const,
     analyze: (body: unknown) => ['ai', 'analyze', body] as const,
  },
} as const;