import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type {
  TicketRecord,
  CommentRecord,
  MajorIncidentRecord,
  CustomerRecord,
  AuditLog,
  WatcherNotification,
  FileEvidence,
} from '../types/app';
import type {
  UserRecord,
  SlaRule,
  HolidayRecord,
  TicketTemplate,
  KbArticle,
  CategoryRecord,
} from '../types/admin';
import type { BuFormConfig } from '../types/forms';
import type { Permission, RoleDefinition } from '../types/rbac';
import type { EscalationRule } from '../types/reference';
import type { NotificationConfig } from '../context/ConfigContext';

/**
 * Auth hooks
 */
export function useAuthMe(options?: UseQueryOptions<{ user: UserRecord & { name?: string } }>) {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: api.me,
    ...options,
  });
}

/**
 * Ticket hooks
 */
export function useTickets(filters?: Record<string, unknown>, options?: UseQueryOptions<TicketRecord[]>) {
  return useQuery({
    queryKey: queryKeys.tickets.all(filters),
    queryFn: () => api.listTickets(filters),
    ...options,
  });
}

export function useTicket(id: string, options?: UseQueryOptions<TicketRecord>) {
  return useQuery({
    queryKey: queryKeys.tickets.detail(id),
    queryFn: () => api.getTicket(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateTicket(options?: UseMutationOptions<TicketRecord, Error, Partial<TicketRecord>>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticket) => api.createTicket(ticket),
    onSuccess: (newTicket) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all() });
      queryClient.setQueryData(queryKeys.tickets.detail(newTicket.id), newTicket);
    },
    ...options,
  });
}

export function useUpdateTicket(options?: UseMutationOptions<TicketRecord, Error, { id: string; patch: Partial<TicketRecord> }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => api.updateTicket(id, patch),
    onSuccess: (updated, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all() });
      queryClient.setQueryData(queryKeys.tickets.detail(id), updated);
    },
    ...options,
  });
}

export function useDeleteTicket(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteTicket(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all() });
      queryClient.removeQueries({ queryKey: queryKeys.tickets.detail(id) });
    },
    ...options,
  });
}

export function useSubmitFeedback(options?: UseMutationOptions<TicketRecord, Error, { id: string; patch: { feedbackScore: number | null; feedbackComment: string | null } }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => api.submitFeedback(id, patch),
    onSuccess: (updated, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all() });
      queryClient.setQueryData(queryKeys.tickets.detail(id), updated);
    },
    ...options,
  });
}

export function useTransitionTicket(options?: UseMutationOptions<TicketRecord, Error, { id: string; status: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => api.transitionTicket(id, status),
    onSuccess: (updated, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all() });
      queryClient.setQueryData(queryKeys.tickets.detail(id), updated);
    },
    ...options,
  });
}

/**
 * Comment hooks
 */
export function useComments(ticketId: string, options?: UseQueryOptions<CommentRecord[]>) {
  return useQuery({
    queryKey: queryKeys.comments.all(),
    queryFn: () => api.listComments(ticketId),
    enabled: !!ticketId,
    ...options,
  });
}

export function useCreateComment(options?: UseMutationOptions<CommentRecord, Error, Partial<CommentRecord>>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comment) => api.createComment(comment),
    onSuccess: (newComment) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments.all() });
      if (newComment.ticketId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.comments(newComment.ticketId) });
      }
    },
    ...options,
  });
}

/**
 * Major Incident hooks
 */
export function useMajorIncidents(filters?: Record<string, unknown>, options?: UseQueryOptions<MajorIncidentRecord[]>) {
  return useQuery({
    queryKey: queryKeys.majorIncidents.all(filters),
    queryFn: () => api.listMajorIncidents(filters),
    ...options,
  });
}

export function useMajorIncident(id: string, options?: UseQueryOptions<MajorIncidentRecord>) {
  return useQuery({
    queryKey: queryKeys.majorIncidents.detail(id),
    queryFn: () => api.getMajorIncident(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateMajorIncident(options?: UseMutationOptions<MajorIncidentRecord, Error, Partial<MajorIncidentRecord>>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mi) => api.createMajorIncident(mi),
    onSuccess: (newMi) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.all() });
      queryClient.setQueryData(queryKeys.majorIncidents.detail(newMi.id), newMi);
    },
    ...options,
  });
}

export function useUpdateMajorIncident(options?: UseMutationOptions<MajorIncidentRecord, Error, { id: string; patch: Partial<MajorIncidentRecord> }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => api.updateMajorIncident(id, patch),
    onSuccess: (updated, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.all() });
      queryClient.setQueryData(queryKeys.majorIncidents.detail(id), updated);
    },
    ...options,
  });
}

/**
 * Customer hooks
 */
export function useCustomers(filters?: Record<string, unknown>, options?: UseQueryOptions<CustomerRecord[]>) {
  return useQuery({
    queryKey: queryKeys.customers.all(filters),
    queryFn: () => api.listCustomers(filters),
    ...options,
  });
}

export function useCustomer(id: string, options?: UseQueryOptions<CustomerRecord>) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => api.getCustomer(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateCustomer(options?: UseMutationOptions<CustomerRecord, Error, Partial<CustomerRecord>>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customer) => api.createCustomer(customer),
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      queryClient.setQueryData(queryKeys.customers.detail(newCustomer.id), newCustomer);
    },
    ...options,
  });
}

export function useUpdateCustomer(options?: UseMutationOptions<CustomerRecord, Error, { id: string; patch: Partial<CustomerRecord> }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => api.updateCustomer(id, patch),
    onSuccess: (updated, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      queryClient.setQueryData(queryKeys.customers.detail(id), updated);
    },
    ...options,
  });
}

export function useDeleteCustomer(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteCustomer(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      queryClient.removeQueries({ queryKey: queryKeys.customers.detail(id) });
    },
    ...options,
  });
}

/**
 * Audit Log hooks
 */
export function useAuditLogs(limit = 500, options?: UseQueryOptions<AuditLog[]>) {
  return useQuery({
    queryKey: queryKeys.auditLogs.all(limit),
    queryFn: () => api.listAuditLogs(limit),
    ...options,
  });
}

export function useVerifyAuditChain(options?: UseQueryOptions<{ valid: boolean; brokenIndex: number | null }>) {
  return useQuery({
    queryKey: queryKeys.auditLogs.verify(),
    queryFn: api.verifyAudit,
    ...options,
  });
}

/**
 * Notification hooks
 */
export function useWatcherNotifications(recipient?: string, options?: UseQueryOptions<WatcherNotification[]>) {
  return useQuery({
    queryKey: queryKeys.notifications.all(recipient),
    queryFn: () => api.listNotifications(recipient),
    ...options,
  });
}

export function useMarkNotificationRead(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
    ...options,
  });
}

/**
 * User hooks
 */
export function useUsers(options?: UseQueryOptions<UserRecord[]>) {
  return useQuery({
    queryKey: queryKeys.users.all(),
    queryFn: api.listUsers,
    ...options,
  });
}

export function useCreateUser(options?: UseMutationOptions<UserRecord, Error, Partial<UserRecord>>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (user) => api.createUser(user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
    ...options,
  });
}

export function useUpdateUser(options?: UseMutationOptions<UserRecord, Error, { id: string; patch: Partial<UserRecord> }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => api.updateUser(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
    ...options,
  });
}

export function useDeleteUser(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    },
    ...options,
  });
}

/**
 * Config hooks
 */
export function useBusinessUnits(options?: UseQueryOptions<string[]>) {
  return useQuery({
    queryKey: queryKeys.config.businessUnits(),
    queryFn: () => api.getConfig('businessUnits', []),
    ...options,
  });
}

export function usePaymentChannels(options?: UseQueryOptions<string[]>) {
  return useQuery({
    queryKey: queryKeys.config.paymentChannels(),
    queryFn: () => api.getConfig('paymentChannels', []),
    ...options,
  });
}

export function usePartners(options?: UseQueryOptions<string[]>) {
  return useQuery({
    queryKey: queryKeys.config.partners(),
    queryFn: () => api.getConfig('partners', []),
    ...options,
  });
}

export function useCategories(options?: UseQueryOptions<CategoryRecord[]>) {
  return useQuery({
    queryKey: queryKeys.config.categories(),
    queryFn: () => api.getConfig('categories', []),
    ...options,
  });
}

export function useSlaRules(options?: UseQueryOptions<SlaRule[]>) {
  return useQuery({
    queryKey: queryKeys.config.slaRules(),
    queryFn: () => api.getConfig('sla_rules', []),
    ...options,
  });
}

export function useHolidays(options?: UseQueryOptions<HolidayRecord[]>) {
  return useQuery({
    queryKey: queryKeys.config.holidays(),
    queryFn: () => api.getConfig('holidays', []),
    ...options,
  });
}

export function useTicketTemplates(options?: UseQueryOptions<TicketTemplate[]>) {
  return useQuery({
    queryKey: queryKeys.config.ticketTemplates(),
    queryFn: () => api.getConfig('ticket_templates', []),
    ...options,
  });
}

export function useKbArticles(options?: UseQueryOptions<KbArticle[]>) {
  return useQuery({
    queryKey: queryKeys.config.kbArticles(),
    queryFn: () => api.getConfig('kb_articles', []),
    ...options,
  });
}

export function useBuFormConfigs(bu?: string, options?: UseQueryOptions<BuFormConfig[]>) {
  return useQuery({
    queryKey: queryKeys.config.formConfigs(bu),
    queryFn: () => api.getFormConfigs(bu),
    ...options,
  });
}

export function useRoles(options?: UseQueryOptions<RoleDefinition[]>) {
  return useQuery({
    queryKey: queryKeys.config.roles(),
    queryFn: () => api.getConfig('roles', []),
    ...options,
  });
}

export function useSavedReplies(options?: UseQueryOptions<string[]>) {
  return useQuery({
    queryKey: queryKeys.config.savedReplies(),
    queryFn: () => api.getConfig('savedReplies', []),
    ...options,
  });
}

export function useNotificationConfigs(options?: UseQueryOptions<NotificationConfig[]>) {
  return useQuery({
    queryKey: queryKeys.config.notificationConfigs(),
    queryFn: () => api.getConfig<NotificationConfig[]>('notificationConfigs', []),
    ...options,
  });
}

export function useEscalationRules(options?: UseQueryOptions<EscalationRule[]>) {
  return useQuery({
    queryKey: queryKeys.config.escalationRules(),
    queryFn: () => api.getConfig<EscalationRule[]>('escalationRules', []),
    ...options,
  });
}

export function useSettings(options?: UseQueryOptions<Record<string, unknown>>) {
  return useQuery({
    queryKey: queryKeys.config.settings(),
    queryFn: () => api.getConfig('settings', {}),
    ...options,
  });
}

/**
 * Evidence hooks
 */
export function useEvidence(ticketIds?: string[], options?: UseQueryOptions<FileEvidence[]>) {
  return useQuery({
    queryKey: queryKeys.evidence.all(ticketIds),
    queryFn: () => api.listEvidence(ticketIds),
    ...options,
  });
}

export function useUploadEvidence(options?: UseMutationOptions<FileEvidence, Error, { ticketId: string; blob: Blob; fileName: string; fileType: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, blob, fileName, fileType }) => api.uploadEvidence(ticketId, blob, fileName, fileType),
    onSuccess: (newEvidence) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all() });
      if (newEvidence.ticketId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.evidence(newEvidence.ticketId) });
      }
    },
    ...options,
  });
}

export function useDeleteEvidence(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteEvidence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all() });
    },
    ...options,
  });
}

/**
 * AI hooks
 */
export function useGeminiClassify(options?: UseMutationOptions<unknown, Error, { description: string; categories: unknown }>) {
  return useMutation({
    mutationFn: ({ description, categories }) => api.geminiClassify(description, categories),
    ...options,
  });
}

export function useGeminiRca(options?: UseMutationOptions<unknown, Error, { ticketDetails: unknown }>) {
  return useMutation({
    mutationFn: ({ ticketDetails }) => api.geminiRca(ticketDetails),
    ...options,
  });
}

export function useGeminiChat(options?: UseMutationOptions<unknown, Error, { message: string; history: unknown[] }>) {
  return useMutation({
    mutationFn: ({ message, history }) => api.geminiChat(message, history),
    ...options,
  });
}

export function useGeminiAnalyze(options?: UseMutationOptions<unknown, Error, unknown>) {
  return useMutation({
    mutationFn: (body) => api.geminiAnalyze(body),
    ...options,
  });
}

/**
 * RBAC hooks
 */
export function usePermissions(_role: string): Permission[] {
  // This would typically come from a query or context
  // For now, return empty array - implement based on your RBAC system
  return [];
}

export function useHasPermission(_permission: Permission, _role?: string): boolean {
  // Implement based on your RBAC system
  return true;
}

/**
 * Config mutation hooks
 */
export function useUpdateConfig(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: unknown) => api.putConfig(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config[key as keyof typeof queryKeys.config]?.() || ['config', key] });
    },
  });
}