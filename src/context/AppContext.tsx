import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { UserRole, TicketStatus, type TicketRecord, type CommentRecord, type AuditLog, type WatcherNotification, type MajorIncidentRecord, type CustomerRecord, type FileEvidence } from '../types/app';
import type { UserRecord, SlaRule, HolidayRecord, TicketTemplate, KbArticle, CategoryRecord } from '../types/admin';
import type { BuFormConfig } from '../types/forms';
import type { RoleDefinition, Permission } from '../types/rbac';
import { getRoles } from '../lib/rbac';
import { useToast } from '../hooks/useToast';
import { api, hasSession, type BootstrapData } from '../lib/api';
import { normalizeStatus } from '../lib/ticketStateMachine';
import { connectEvents } from '../lib/api';
import { db } from '../lib/db';
import { clearAppData } from '../lib/db';
import { queryClient, queryKeys } from '../lib/queryClient';import type { TransitionRule } from '../lib/ticketStateMachine';
import { useConfigDomain, ConfigProvider } from './ConfigContext';
import { useAdminDomain, AdminProvider } from './AdminContext';
import { useAppShellDomain, defaultUser, AppShellProvider } from './AppShellContext';
import { useTicketDomain, TicketProvider } from './TicketContext';

// Re-export domain hooks for narrow consumers
export { useConfigContext, ConfigContext, ConfigProvider } from './ConfigContext';
export { useAdminContext, AdminContext, AdminProvider } from './AdminContext';
export { useAppShell, AppShellContext, AppShellProvider } from './AppShellContext';
export { useTicketContext, TicketContext, TicketProvider } from './TicketContext';

export interface CurrentUser {
  firstName: string;
  lastName: string;
  email: string;
  bu: string;
  phone: string;
}

export interface NotificationConfig {
  id: string;
  stage: string;
  email: string;
}

export interface AppContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  setMustChangePassword: Dispatch<SetStateAction<boolean>>;
  currentRole: UserRole;
  currentUser: CurrentUser;
  handleLogin: (email: string, password: string) => Promise<boolean>;
  handleLogout: () => void;
  handleRoleChange: (role: UserRole) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeTicketId: string;
  setActiveTicketId: (id: string) => void;
  tickets: TicketRecord[];
  setTickets: Dispatch<SetStateAction<TicketRecord[]>>;
  comments: CommentRecord[];
  setComments: Dispatch<SetStateAction<CommentRecord[]>>;
  auditLogs: AuditLog[];
  setAuditLogs: Dispatch<SetStateAction<AuditLog[]>>;
  watcherNotifications: WatcherNotification[];
  setWatcherNotifications: Dispatch<SetStateAction<WatcherNotification[]>>;
  evidence: FileEvidence[];
  setEvidence: Dispatch<SetStateAction<FileEvidence[]>>;
  majorIncidents: MajorIncidentRecord[];
  setMajorIncidents: Dispatch<SetStateAction<MajorIncidentRecord[]>>;
  users: UserRecord[];
  setUsers: Dispatch<SetStateAction<UserRecord[]>>;
  slaRules: SlaRule[];
  setSlaRules: Dispatch<SetStateAction<SlaRule[]>>;
  holidays: HolidayRecord[];
  setHolidays: Dispatch<SetStateAction<HolidayRecord[]>>;
  ticketTemplates: TicketTemplate[];
  setTicketTemplates: Dispatch<SetStateAction<TicketTemplate[]>>;
  kbArticles: KbArticle[];
  setKbArticles: Dispatch<SetStateAction<KbArticle[]>>;
  savedReplies: string[];
  setSavedReplies: Dispatch<SetStateAction<string[]>>;
  businessUnits: string[];
  setBusinessUnits: Dispatch<SetStateAction<string[]>>;
  businessUnitCodes: Record<string, string>;
  setBusinessUnitCodes: Dispatch<SetStateAction<Record<string, string>>>;
  providers: string[];
  setProviders: Dispatch<SetStateAction<string[]>>;
  paymentChannels: string[];
  setPaymentChannels: Dispatch<SetStateAction<string[]>>;
  categories: CategoryRecord[];
  setCategories: Dispatch<SetStateAction<CategoryRecord[]>>;
  buFormConfigs: BuFormConfig[];
  setBuFormConfigs: Dispatch<SetStateAction<BuFormConfig[]>>;
  roles: RoleDefinition[];
  setRoles: Dispatch<SetStateAction<RoleDefinition[]>>;
  can: (permission: Permission) => boolean;
  notificationConfigs: NotificationConfig[];
  setNotificationConfigs: Dispatch<SetStateAction<NotificationConfig[]>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  priorityFilter: string;
  setPriorityFilter: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  commentText: string;
  setCommentText: Dispatch<SetStateAction<string>>;
  showToast: (message: string, type?: 'success' | 'info' | 'error' | 'warning', duration?: number, action?: { label: string; onClick: () => void }) => void;
  logAuditAction: (ticketId: string | null, action: string, details: string) => Promise<void>;
  saveToStorage: (t?: TicketRecord[], c?: CommentRecord[], a?: AuditLog[], m?: MajorIncidentRecord[], wn?: WatcherNotification[], uList?: UserRecord[], sRules?: SlaRule[], hList?: HolidayRecord[], tTemplates?: TicketTemplate[], kArticles?: KbArticle[]) => void;
  getTicketRisk: (t: TicketRecord) => { isAtRisk: boolean; riskScore: number; reason: string };
  notifyWatchers: (ticket: TicketRecord, message: string, updatedTicketsList?: TicketRecord[]) => void;
  getScopedTickets: (allTickets?: TicketRecord[]) => TicketRecord[];
  customers: CustomerRecord[];
  setCustomers: Dispatch<SetStateAction<CustomerRecord[]>>;
  handleCreateTicket: (ticketData: Partial<TicketRecord>) => string;
  getAvailableTicketTransitions: (ticket: TicketRecord) => TransitionRule[];
  isTicketTerminal: (ticket: TicketRecord) => boolean;
  transitionTicket: (ticketId: string, toStatus: TicketStatus) => Promise<TicketRecord>;
}

export const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

interface LatestState {
  tickets: TicketRecord[];
  comments: CommentRecord[];
  auditLogs: AuditLog[];
  majorIncidents: MajorIncidentRecord[];
  watcherNotifications: WatcherNotification[];
  users: UserRecord[];
  slaRules: SlaRule[];
  holidays: HolidayRecord[];
  ticketTemplates: TicketTemplate[];
  kbArticles: KbArticle[];
  savedReplies: string[];
  customers: CustomerRecord[];
  businessUnits: string[];
  businessUnitCodes: Record<string, string>;
  providers: string[];
  paymentChannels: string[];
  categories: CategoryRecord[];
  evidence: FileEvidence[];
  buFormConfigs: BuFormConfig[];
  roles: RoleDefinition[];
}

interface PersistedState {
  tickets?: TicketRecord[];
  comments?: CommentRecord[];
  auditLogs?: AuditLog[];
  majorIncidents?: MajorIncidentRecord[];
  watcherNotifications?: WatcherNotification[];
  users?: UserRecord[];
  slaRules?: SlaRule[];
  holidays?: HolidayRecord[];
  ticketTemplates?: TicketTemplate[];
  kbArticles?: KbArticle[];
  savedReplies?: string[];
  customers?: CustomerRecord[];
  businessUnits?: string[];
  businessUnitCodes?: Record<string, string>;
  providers?: string[];
  paymentChannels?: string[];
  categories?: CategoryRecord[];
  evidence?: FileEvidence[];
  buFormConfigs?: BuFormConfig[];
  roles?: RoleDefinition[];
}

async function persistToDexie(state: PersistedState): Promise<void> {
   try {
     const writes: Promise<unknown>[] = [];
     if (state.tickets) writes.push(db.tickets.bulkPut(state.tickets));
     if (state.comments) writes.push(db.comments.bulkPut(state.comments));
     if (state.auditLogs) writes.push(db.auditLogs.bulkPut(state.auditLogs));
     if (state.majorIncidents) writes.push(db.majorIncidents.bulkPut(state.majorIncidents));
     if (state.watcherNotifications) writes.push(db.watcherNotifications.bulkPut(state.watcherNotifications));
     if (state.users) writes.push(db.users.bulkPut(state.users));
     if (state.slaRules) writes.push(db.slaRules.bulkPut(state.slaRules));
     if (state.holidays) writes.push(db.holidays.bulkPut(state.holidays));
     if (state.ticketTemplates) writes.push(db.ticketTemplates.bulkPut(state.ticketTemplates));
     if (state.kbArticles) writes.push(db.kbArticles.bulkPut(state.kbArticles));
if (state.savedReplies) writes.push(db.savedReplies.bulkPut(state.savedReplies.map(s => ({ id: s }))));
      if (state.customers) writes.push(db.customers.bulkPut(state.customers));
      if (state.businessUnits) writes.push(db.businessUnits.bulkPut(state.businessUnits.map(s => ({ id: s }))));
      if (state.providers) writes.push(db.providers.bulkPut(state.providers.map(s => ({ id: s }))));
      if (state.paymentChannels) writes.push(db.paymentChannels.bulkPut(state.paymentChannels.map(s => ({ id: s }))));
     if (state.categories) writes.push(db.categories.bulkPut(state.categories));
     if (state.evidence) writes.push(db.evidence.bulkPut(state.evidence));
     if (state.buFormConfigs) writes.push(db.buFormConfigs.bulkPut(state.buFormConfigs));
     if (state.roles) writes.push(db.roles.bulkPut(state.roles));
     await Promise.all(writes);
   } catch (error) {
     console.warn('Failed to persist state to Dexie:', error);
   }
 }

/**
 * Seed the TanStack Query cache with bootstrap payload so domain hooks
 * (useTickets, useComments, ...) resolve instantly without a second fetch.
 * This keeps the legacy context state and the new query layer in sync.
 */
function seedQueryCacheFromBootstrap(data: BootstrapData): void {
  const set = (key: readonly unknown[], value: unknown) => {
    if (value !== undefined) queryClient.setQueryData(key, value);
  };
  set(queryKeys.tickets.all(), data.tickets);
  set(queryKeys.comments.all(), data.comments);
  set(queryKeys.auditLogs.all(500), data.auditLogs);
  set(queryKeys.notifications.all(), data.watcherNotifications);
  set(queryKeys.majorIncidents.all(), data.majorIncidents);
  set(queryKeys.users.all(), data.users);
  set(queryKeys.customers.all(), data.customers);
  set(queryKeys.evidence.all(), data.evidence);
  set(queryKeys.config.slaRules(), data.slaRules);
  set(queryKeys.config.holidays(), data.holidays);
  set(queryKeys.config.ticketTemplates(), data.ticketTemplates);
  set(queryKeys.config.kbArticles(), data.kbArticles);
  set(queryKeys.config.savedReplies(), data.savedReplies);
  set(queryKeys.config.businessUnits(), data.businessUnits);
  set(queryKeys.config.providers(), data.providers);
  set(queryKeys.config.categories(), data.categories);
  set(queryKeys.config.formConfigs(), data.buFormConfigs);
  set(queryKeys.config.roles(), getRoles(data.roles));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const toastHook = useToast();
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' | 'warning' = 'success', duration?: number, action?: { label: string; onClick: () => void }) => {
    toastHook.addToast(message, type, duration, action);
  }, [toastHook]);

  const config = useConfigDomain();
  const admin = useAdminDomain();
  const shell = useAppShellDomain(config.roles);

  const lastLocalUpdate = useRef<Record<string, number>>({});

  // Snapshot of latest state across all domains. saveToStorage keeps a stable
  // identity (empty deps) so dependent callbacks/effects don't re-fire on every
  // render, while still reading the freshest persisted values.
  const latestStateRef = useRef<LatestState>({
    tickets: [], comments: [], auditLogs: [], majorIncidents: [], watcherNotifications: [],
    users: admin.users, slaRules: admin.slaRules, holidays: admin.holidays,
    ticketTemplates: admin.ticketTemplates, kbArticles: config.kbArticles,
    savedReplies: config.savedReplies, customers: config.customers,
    businessUnits: admin.businessUnits, providers: admin.providers,
    businessUnitCodes: admin.businessUnitCodes, paymentChannels: admin.paymentChannels,
    categories: admin.categories, evidence: [], buFormConfigs: config.buFormConfigs,
    roles: config.roles,
  });

  const sanitizeTicket = (ticket: TicketRecord): TicketRecord => {
    const sanitized = { ...ticket };
    // Mask PII fields for client-side storage
    if (sanitized.customerEmail) {
      sanitized.customerEmail = sanitized.customerEmail.length > 2 
        ? sanitized.customerEmail.substring(0, 2) + '***' + sanitized.customerEmail.split('@')[1]
        : '***';
    }
    if (sanitized.customerPhone) {
      sanitized.customerPhone = sanitized.customerPhone.length > 6 
        ? sanitized.customerPhone.substring(0, 6) + '***'
        : '***';
    }
    return sanitized;
  };

  const saveToStorage = useCallback((
    t?: TicketRecord[], c?: CommentRecord[], a?: AuditLog[], m?: MajorIncidentRecord[],
    wn?: WatcherNotification[], uList?: UserRecord[], sRules?: SlaRule[],
    hList?: HolidayRecord[], tTemplates?: TicketTemplate[], kArticles?: KbArticle[],
    sReplies?: string[], cList?: CustomerRecord[],
    buList?: string[], provList?: string[], catList?: CategoryRecord[],
    eList?: FileEvidence[], fConfigs?: BuFormConfig[], rList?: RoleDefinition[],
  ) => {
    const latest = latestStateRef.current;
    const sanitizedTickets = t !== undefined ? t.map(sanitizeTicket) : latest.tickets.map(sanitizeTicket);
    localStorage.setItem('4c_tickets', JSON.stringify(sanitizedTickets));
    localStorage.setItem('4c_comments', JSON.stringify(c !== undefined ? c : latest.comments));
    localStorage.setItem('4c_audit', JSON.stringify(a !== undefined ? a : latest.auditLogs));
    localStorage.setItem('4c_major_incidents', JSON.stringify(m !== undefined ? m : latest.majorIncidents));
    localStorage.setItem('4c_watcher_notifications', JSON.stringify(wn !== undefined ? wn : latest.watcherNotifications));
    const sanitizedUsers = uList !== undefined 
      ? uList.map(u => (({ password_hash: _, ...rest }) => rest)(u as any)) 
      : latest.users.map(u => (({ password_hash: _, ...rest }) => rest)(u as any));
    localStorage.setItem('4c_users', JSON.stringify(sanitizedUsers));
    localStorage.setItem('4c_sla_rules', JSON.stringify(sRules !== undefined ? sRules : latest.slaRules));
    localStorage.setItem('4c_holidays', JSON.stringify(hList !== undefined ? hList : latest.holidays));
    localStorage.setItem('4c_ticket_templates', JSON.stringify(tTemplates !== undefined ? tTemplates : latest.ticketTemplates));
    localStorage.setItem('4c_kb_articles', JSON.stringify(kArticles !== undefined ? kArticles : latest.kbArticles));
    localStorage.setItem('4c_saved_replies', JSON.stringify(sReplies !== undefined ? sReplies : latest.savedReplies));
    localStorage.setItem('4c_customers', JSON.stringify(cList !== undefined ? cList : latest.customers));
    localStorage.setItem('4c_business_units', JSON.stringify(buList !== undefined ? buList : latest.businessUnits));
    localStorage.setItem('4c_business_unit_codes', JSON.stringify(latest.businessUnitCodes));
    localStorage.setItem('4c_providers', JSON.stringify(provList !== undefined ? provList : latest.providers));
    localStorage.setItem('4c_payment_channels', JSON.stringify(latest.paymentChannels));
    localStorage.setItem('4c_categories', JSON.stringify(catList !== undefined ? catList : latest.categories));
    localStorage.setItem('4c_evidence', JSON.stringify(eList !== undefined ? eList : latest.evidence));
    localStorage.setItem('4c_bu_form_configs', JSON.stringify(fConfigs !== undefined ? fConfigs : latest.buFormConfigs));
    localStorage.setItem('4c_roles', JSON.stringify(rList !== undefined ? rList : latest.roles));

    // Mirror to IndexedDB for larger datasets / offline resilience.
    void persistToDexie({
      tickets: t !== undefined ? t : latest.tickets,
      comments: c !== undefined ? c : latest.comments,
      auditLogs: a !== undefined ? a : latest.auditLogs,
      majorIncidents: m !== undefined ? m : latest.majorIncidents,
      watcherNotifications: wn !== undefined ? wn : latest.watcherNotifications,
      users: uList !== undefined ? uList : latest.users,
      slaRules: sRules !== undefined ? sRules : latest.slaRules,
      holidays: hList !== undefined ? hList : latest.holidays,
      ticketTemplates: tTemplates !== undefined ? tTemplates : latest.ticketTemplates,
      kbArticles: kArticles !== undefined ? kArticles : latest.kbArticles,
      savedReplies: sReplies !== undefined ? sReplies : latest.savedReplies,
      customers: cList !== undefined ? cList : latest.customers,
      businessUnits: buList !== undefined ? buList : latest.businessUnits,
      providers: provList !== undefined ? provList : latest.providers,
      paymentChannels: latest.paymentChannels,
      categories: catList !== undefined ? catList : latest.categories,
      evidence: eList !== undefined ? eList : latest.evidence,
      buFormConfigs: fConfigs !== undefined ? fConfigs : latest.buFormConfigs,
      roles: rList !== undefined ? rList : latest.roles,
    }).catch(() => {
      // IndexedDB unavailable (private mode / quota) — localStorage already written.
    });
  }, []);

  const ticket = useTicketDomain({ shell, admin, saveToStorage, showToast });

  // Populate the latest-state snapshot with fresh values every render so that
  // saveToStorage() (no args) persists the current state of every domain.
  useEffect(() => {
    latestStateRef.current = {
      tickets: ticket.tickets,
      comments: ticket.comments,
      auditLogs: ticket.auditLogs,
      majorIncidents: ticket.majorIncidents,
      watcherNotifications: ticket.watcherNotifications,
      users: admin.users,
      slaRules: admin.slaRules,
      holidays: admin.holidays,
      ticketTemplates: admin.ticketTemplates,
      kbArticles: config.kbArticles,
      savedReplies: config.savedReplies,
      customers: config.customers,
      businessUnits: admin.businessUnits,
      businessUnitCodes: admin.businessUnitCodes,
      providers: admin.providers,
      paymentChannels: admin.paymentChannels,
      categories: admin.categories,
      evidence: ticket.evidence,
      buFormConfigs: config.buFormConfigs,
      roles: config.roles,
    };
  });

  const { logAuditAction, notifyWatchers, transitionTicket, handleCreateTicket } = ticket;
  const { tickets: ticketList, comments: commentList, setAuditLogs: setTicketAuditLogs } = ticket;

  // Hydrate every domain from the server bootstrap payload (source of truth).
  // Depends only on stable state setters so the callback identity never changes
  // and the session-restore effect below does not re-fire on every render.
  const hydrateFromBootstrap = useCallback(async () => {
    const data = await api.bootstrap();
    seedQueryCacheFromBootstrap(data);
    if (data.tickets) ticket.setTickets(data.tickets);    if (data.comments) ticket.setComments(data.comments);
    if (data.auditLogs) ticket.setAuditLogs(data.auditLogs);
    if (data.watcherNotifications) ticket.setWatcherNotifications(data.watcherNotifications);
    if (data.majorIncidents) ticket.setMajorIncidents(data.majorIncidents);
    if (data.users) admin.setUsers(data.users);
    if (data.slaRules) admin.setSlaRules(data.slaRules);
    if (data.holidays) admin.setHolidays(data.holidays);
    if (data.ticketTemplates) admin.setTicketTemplates(data.ticketTemplates);
    if (data.kbArticles) config.setKbArticles(data.kbArticles);
    if (data.customers) config.setCustomers(data.customers);
    if (data.savedReplies) config.setSavedReplies(data.savedReplies);
    if (data.businessUnits) admin.setBusinessUnits(data.businessUnits);
    if (data.businessUnitCodes) admin.setBusinessUnitCodes(data.businessUnitCodes);
    if (data.providers) admin.setProviders(data.providers);
    if (data.paymentChannels) admin.setPaymentChannels(data.paymentChannels);
    if (data.categories) admin.setCategories(data.categories);
    if (data.buFormConfigs) config.setBuFormConfigs(data.buFormConfigs);
    if (data.roles) config.setRoles(getRoles(data.roles));
    if (data.evidence) ticket.setEvidence(data.evidence);
    if (data.notificationConfigs) config.setNotificationConfigs(data.notificationConfigs as NotificationConfig[]);
    // Persist server state as the offline/refresh fallback
    localStorage.setItem('4c_tickets', JSON.stringify(data.tickets || []));
    localStorage.setItem('4c_comments', JSON.stringify(data.comments || []));
    localStorage.setItem('4c_audit', JSON.stringify(data.auditLogs || []));
    localStorage.setItem('4c_major_incidents', JSON.stringify(data.majorIncidents || []));
    localStorage.setItem('4c_watcher_notifications', JSON.stringify(data.watcherNotifications || []));
    localStorage.setItem('4c_users', JSON.stringify(data.users || []));
    localStorage.setItem('4c_sla_rules', JSON.stringify(data.slaRules || []));
    localStorage.setItem('4c_holidays', JSON.stringify(data.holidays || []));
    localStorage.setItem('4c_ticket_templates', JSON.stringify(data.ticketTemplates || []));
    localStorage.setItem('4c_kb_articles', JSON.stringify(data.kbArticles || []));
    localStorage.setItem('4c_roles', JSON.stringify(getRoles(data.roles) || []));
    localStorage.setItem('4c_saved_replies', JSON.stringify(data.savedReplies || []));
    localStorage.setItem('4c_customers', JSON.stringify(data.customers || []));
    localStorage.setItem('4c_business_units', JSON.stringify(data.businessUnits || []));
    localStorage.setItem('4c_business_unit_codes', JSON.stringify(data.businessUnitCodes || {}));
    localStorage.setItem('4c_providers', JSON.stringify(data.providers || []));
    localStorage.setItem('4c_payment_channels', JSON.stringify(data.paymentChannels || []));
    localStorage.setItem('4c_categories', JSON.stringify(data.categories || []));
    localStorage.setItem('4c_bu_form_configs', JSON.stringify(data.buFormConfigs || []));
    localStorage.setItem('4c_evidence', JSON.stringify(data.evidence || []));
    // Mirror to IndexedDB for offline resilience
    void persistToDexie({
      tickets: data.tickets,
      comments: data.comments,
      auditLogs: data.auditLogs,
      majorIncidents: data.majorIncidents,
      watcherNotifications: data.watcherNotifications,
      users: data.users,
      slaRules: data.slaRules,
      holidays: data.holidays,
      ticketTemplates: data.ticketTemplates,
      kbArticles: data.kbArticles,
      savedReplies: data.savedReplies,
      customers: data.customers,
      businessUnits: data.businessUnits,
      providers: data.providers,
      paymentChannels: data.paymentChannels,
      categories: data.categories,
      evidence: data.evidence,
      buFormConfigs: data.buFormConfigs,
      roles: getRoles(data.roles),
    }).catch(() => {
      // IndexedDB unavailable — localStorage fallback already written.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Role change handler — DEV ONLY
  const handleRoleChange = useCallback((role: UserRole) => {
    if (!import.meta.env.DEV) { showToast('Role switching is disabled in production.', 'error'); return; }
    shell.setCurrentRole(role);
    let u: CurrentUser = { firstName: 'Sarah', lastName: 'Jenkins', email: 's.jenkins@customer.com', bu: 'POSSAP', phone: '+1-555-0101' };
    if (role === UserRole.BU_SUPPORT) {
      u = { firstName: 'Sarah', lastName: 'Jenkins', email: 's.jenkins@customer.com', bu: 'POSSAP', phone: '+1-555-0101' };
      shell.setActiveTab('tickets');
    } else if (role === UserRole.PROVIDER) {
      u = { firstName: 'Marcus', lastName: 'Lee', email: 'm.lee@provider.com', bu: 'Parkway', phone: '+1-555-0202' };
      shell.setActiveTab('tickets');
    } else if (role === UserRole.EXECUTIVE) {
      u = { firstName: 'Elena', lastName: 'Rostova', email: 'e.rostova@exec.com', bu: 'CORPORATE', phone: '+1-555-0303' };
      shell.setActiveTab('dashboard');
    } else if (role === UserRole.SUPER_ADMIN) {
      u = { firstName: 'Super', lastName: 'Administrator', email: 'admin@4core.com', bu: 'ALL', phone: '+1-555-0404' };
      shell.setActiveTab('reference_data');
    } else if (role === UserRole.PARTNER) {
      u = { firstName: 'Chidinma', lastName: 'Okafor', email: 'chidinma@example.com', bu: 'POSSAP', phone: '+234-801-234-5678' };
      shell.setActiveTab('partner_portal');
    } else {
      shell.setActiveTab('tickets');
    }
    shell.setCurrentUser(u);
    showToast(`Switched perspective to ${role}`, 'info');
    const newAudit: AuditLog = {
      id: 'aud-' + Date.now(),
      timestamp: new Date().toISOString(),
      ticketId: null,
      actor: u.firstName + ' ' + u.lastName,
      role,
      action: 'ROLE_PERSPECTIVE_SWITCH',
      details: 'Switched session perspective in compliance with regulatory session management protocols.'
    };
    setTicketAuditLogs(prev => {
      const updated = [newAudit, ...prev];
      saveToStorage(ticketList, commentList, updated);
      return updated;
    });
  }, [showToast, ticketList, commentList, saveToStorage, shell, setTicketAuditLogs]);

  // Login handler — calls server API for proper JWT auth
  const handleLogin = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const { user, mustChangePassword } = await api.login(email, password);
      const legacyName = user.name || '';
      shell.setCurrentUser({ firstName: user.firstName || legacyName.split(' ')[0] || '', lastName: user.lastName || legacyName.split(' ').slice(1).join(' ') || '', email: user.email, bu: user.bu, phone: user.phone || '' });
      shell.setCurrentRole(user.role as UserRole);
      shell.setMustChangePassword(Boolean(mustChangePassword));
      shell.setIsAuthenticated(true);

      try {
        await hydrateFromBootstrap();
      } catch {
        // Server unavailable — keep existing state from localStorage/seed
      }

      if (user.role === UserRole.EXECUTIVE) {
        shell.setActiveTab('dashboard');
      } else if (user.role === UserRole.SUPER_ADMIN) {
        shell.setActiveTab('reference_data');
      } else if (user.role === UserRole.PARTNER) {
        shell.setActiveTab('partner_portal');
      } else {
        shell.setActiveTab('tickets');
      }

      showToast(`Welcome, ${user.firstName || legacyName.split(' ')[0] || 'User'}!`, 'success');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      showToast(message, 'error');
      return false;
    }
  }, [showToast, shell, hydrateFromBootstrap]);

  // Logout handler
  const handleLogout = useCallback(() => {
    void api.logout().catch(() => {});
    void logAuditAction(null, 'USER_LOGOUT', `User ${shell.currentUser.firstName + ' ' + shell.currentUser.lastName} logged out.`);
    shell.setIsAuthenticated(false);
    shell.setMustChangePassword(false);
    shell.setCurrentUser(defaultUser);
    shell.setCurrentRole(UserRole.BU_SUPPORT);
    shell.setActiveTab('tickets');
    void clearAppData().catch(() => {});
    showToast('Logged out successfully.', 'info');
    if (window.location.pathname !== '/auth/login') {
      window.location.assign('/auth/login');
    }
  }, [shell, showToast, logAuditAction]);

  // Restore the session on refresh when a server session cookie is present.
  // Runs once on mount: all referenced setters are stable, and re-running on
  // every render would re-hydrate state mid-interaction.
  useEffect(() => {
    if (!hasSession()) {
      shell.setIsLoading(false);
      return;
    }
    api.me()
      .then(async ({ user, mustChangePassword }) => {
        const fullName = user.name || user.email || '';
        const parts = fullName.split(' ');
        shell.setIsAuthenticated(true);
        shell.setMustChangePassword(Boolean(mustChangePassword));
        shell.setCurrentRole(user.role as UserRole);
        shell.setCurrentUser({
          firstName: user.firstName || parts[0] || '',
          lastName: user.lastName || parts.slice(1).join(' ') || '',
          email: user.email,
          bu: user.bu,
          phone: user.phone || '',
        });
        try {
          await hydrateFromBootstrap();
        } catch {
          // Server unavailable — keep existing state from localStorage/seed
        }
      })
      .catch(() => {})
      .finally(() => shell.setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle session expiry signalled by apiFetch on a 401 response
  useEffect(() => {
    const onAuthExpired = () => {
      void api.logout().catch(() => {});
      shell.setIsAuthenticated(false);
      shell.setMustChangePassword(false);
      shell.setCurrentUser(defaultUser);
      shell.setCurrentRole(UserRole.BU_SUPPORT);
      shell.setActiveTab('tickets');
      showToast('Session expired. Please sign in again.', 'warning');
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, [shell, showToast]);

  // Subscribe to SSE real-time events when authenticated
  useEffect(() => {
    if (!shell.isAuthenticated) return;
    const disconnect = connectEvents((event, data) => {
      const d = data as Record<string, string | number | boolean | null | undefined>;
      if (event === 'ticket_updated' && d?.id) {
        const patchStatus = d.status ? normalizeStatus(String(d.status)) : undefined;
        ticket.setTickets(prev => {
          const lastLocal = lastLocalUpdate.current[String(d.id)];
          if (lastLocal && Date.now() - lastLocal < 5000) {
            return prev;
          }
          return prev.map(t => t.id === String(d.id) ? { ...t, ...(d as Record<string, unknown>), ...(patchStatus ? { status: patchStatus } : {}) } : t);
        });
      } else if (event === 'ticket_created' && d?.id) {
        ticket.setTickets(prev => {
          if (prev.some(t => t.id === String(d.id))) return prev;
          const created = d as unknown as TicketRecord;
          return d.customerName ? [{ ...created, status: normalizeStatus(created.status) ?? created.status }, ...prev] : prev;
        });
        showToast('New ticket received.', 'info');
      } else if (event === 'sla_breach' && d?.ticketId) {
        showToast(`SLA Breach: Ticket ${d.ticketId}`, 'error');
      } else if (event === 'sla_at_risk' && d?.ticketId) {
        showToast(`SLA At Risk: Ticket ${d.ticketId}`, 'warning');
      } else if (event === 'comment_added' && d?.id) {
        const incoming = d as unknown as CommentRecord;
        ticket.setComments(prev => prev.some(c => c.id === String(d.id)) ? prev : [incoming, ...prev]);
        const currentName = `${shell.currentUser.firstName} ${shell.currentUser.lastName}`.trim();
        if (incoming.author && incoming.author !== currentName) {
          const msg = String(incoming.message || '');
          showToast(`New chat from ${incoming.author}: "${msg.slice(0, 48)}${msg.length > 48 ? '…' : ''}"`, 'info');
        }
      } else if (event === 'evidence_added' && d?.id) {
        ticket.setEvidence(prev => prev.some(e => e.id === String(d.id)) ? prev : [d as unknown as FileEvidence, ...prev]);
      }
    });
    return disconnect;
  }, [shell.isAuthenticated, showToast, shell.currentUser, ticket]);

  // Persist state to localStorage whenever these values change
  useEffect(() => {
    saveToStorage();
  }, [admin.users, admin.slaRules, admin.holidays, admin.ticketTemplates, config.kbArticles, config.savedReplies, config.customers, admin.businessUnits, admin.businessUnitCodes, admin.providers, admin.paymentChannels, admin.categories, ticket.evidence, config.buFormConfigs, config.roles, saveToStorage]);

  const appContextValue: AppContextType = {
    isLoading: shell.isLoading,
    isAuthenticated: shell.isAuthenticated,
    mustChangePassword: shell.mustChangePassword,
    setMustChangePassword: shell.setMustChangePassword,
    currentRole: shell.currentRole,
    currentUser: shell.currentUser,
    handleLogin,
    handleLogout,
    handleRoleChange,
    activeTab: shell.activeTab,
    setActiveTab: shell.setActiveTab,
    activeTicketId: shell.activeTicketId,
    setActiveTicketId: shell.setActiveTicketId,
    tickets: ticket.tickets,
    setTickets: ticket.setTickets,
    comments: ticket.comments,
    setComments: ticket.setComments,
    auditLogs: ticket.auditLogs,
    setAuditLogs: ticket.setAuditLogs,
    watcherNotifications: ticket.watcherNotifications,
    setWatcherNotifications: ticket.setWatcherNotifications,
    evidence: ticket.evidence,
    setEvidence: ticket.setEvidence,
    majorIncidents: ticket.majorIncidents,
    setMajorIncidents: ticket.setMajorIncidents,
    users: admin.users,
    setUsers: admin.setUsers,
    slaRules: admin.slaRules,
    setSlaRules: admin.setSlaRules,
    holidays: admin.holidays,
    setHolidays: admin.setHolidays,
    ticketTemplates: admin.ticketTemplates,
    setTicketTemplates: admin.setTicketTemplates,
    kbArticles: config.kbArticles,
    setKbArticles: config.setKbArticles,
    savedReplies: config.savedReplies,
    setSavedReplies: config.setSavedReplies,
    businessUnits: admin.businessUnits,
    setBusinessUnits: admin.setBusinessUnits,
    businessUnitCodes: admin.businessUnitCodes,
    setBusinessUnitCodes: admin.setBusinessUnitCodes,
    providers: admin.providers,
    setProviders: admin.setProviders,
    paymentChannels: admin.paymentChannels,
    setPaymentChannels: admin.setPaymentChannels,
    categories: admin.categories,
    setCategories: admin.setCategories,
    buFormConfigs: config.buFormConfigs,
    setBuFormConfigs: config.setBuFormConfigs,
    roles: config.roles,
    setRoles: config.setRoles,
    can: shell.can,
    notificationConfigs: config.notificationConfigs,
    setNotificationConfigs: config.setNotificationConfigs,
    searchQuery: shell.searchQuery,
    setSearchQuery: shell.setSearchQuery,
    priorityFilter: shell.priorityFilter,
    setPriorityFilter: shell.setPriorityFilter,
    statusFilter: shell.statusFilter,
    setStatusFilter: shell.setStatusFilter,
    commentText: shell.commentText,
    setCommentText: shell.setCommentText,
    showToast,
    logAuditAction,
    saveToStorage,
    getTicketRisk: ticket.getTicketRisk,
    notifyWatchers,
    getScopedTickets: ticket.getScopedTickets,
    customers: config.customers,
    setCustomers: config.setCustomers,
    handleCreateTicket,
    getAvailableTicketTransitions: ticket.getAvailableTicketTransitions,
    isTicketTerminal: ticket.isTicketTerminal,
    transitionTicket,
  };

  return (
    <ConfigProvider value={config}>
      <AdminProvider value={admin}>
        <AppShellProvider value={shell}>
          <TicketProvider value={ticket}>
            <AppContext.Provider value={appContextValue}>
              {children}
            </AppContext.Provider>
          </TicketProvider>
        </AppShellProvider>
      </AdminProvider>
    </ConfigProvider>
  );
}
