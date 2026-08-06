import { useState, useEffect, useRef, Suspense, lazy, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Shield, ChevronDown, Menu } from 'lucide-react';

import ErrorBoundary from './components/ui/ErrorBoundary';
import PageErrorBoundary from './components/ui/PageErrorBoundary';
import Sidebar from './components/Sidebar';
import { KbArticle } from './types/admin';
import { TicketStatus, TicketPriority, UserRole, type MajorIncidentRecord, type WatcherNotification } from './types/app';
import { useApp } from './context/AppContext';
import { syncMajorIncident, syncTicketPatch, syncKbArticles } from './lib/sync';
import OnboardingTour from './components/onboarding/OnboardingTour';
import CommandPalette from './components/CommandPalette';

function RouteLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center p-8" role="status" aria-live="polite" aria-label="Loading page">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
        <p className="text-body-sm text-text-muted">Loading…</p>
      </div>
    </div>
  );
}

const KnowledgeBaseTab = lazy(() => import('./components/KnowledgeBaseTab'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const WatcherNotificationsPage = lazy(() => import('./pages/WatcherNotificationsPage'));
const PartnerPortalPage = lazy(() => import('./pages/PartnerPortalPage'));
const ExecutiveDashboardPage = lazy(() => import('./pages/ExecutiveDashboardPage'));
const MajorIncidentsPage = lazy(() => import('./pages/MajorIncidentsPage'));
const TicketWorkspacePage = lazy(() => import('./pages/TicketWorkspacePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ProviderPortalPage = lazy(() => import('./pages/ProviderPortalPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const ReferenceDataPage = lazy(() => import('./pages/ReferenceDataPage'));
const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const ChangePasswordRequiredPage = lazy(() => import('./pages/ChangePasswordRequiredPage'));

export default function App() {
  const app = useApp();
  const {
    isAuthenticated, currentRole, currentUser, handleRoleChange, handleLogout,
    activeTab, setActiveTab, activeTicketId, setActiveTicketId,
    tickets, setTickets, comments,
    auditLogs, watcherNotifications, setWatcherNotifications,
    majorIncidents, setMajorIncidents,
    users, slaRules, holidays, ticketTemplates,
    kbArticles, setKbArticles,
    searchQuery,
    showToast, logAuditAction, saveToStorage, notifyWatchers, can,
  } = app;

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [selectedMajorIncidentId, setSelectedMajorIncidentId] = useState<string | null>('MI-001');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const updateKbArticles = (newArticles: SetStateAction<KbArticle[]>) => {
    setKbArticles(prev => {
      const updated = typeof newArticles === 'function' ? newArticles(prev) : newArticles;
      saveToStorage(tickets, comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, updated);
      syncKbArticles(updated);
      return updated;
    });
  };

  const handleDeclareMajorIncident = (formData: { name: string; description: string; provider: string; category: string; severity: string; initialNotification: string }) => {
    const data = formData;
    if (!data.name.trim() || !data.description.trim()) {
      showToast('Please provide a name and description for the Major Incident.', 'error');
      return;
    }
    const miId = 'MI-' + Math.floor(Math.random() * 900 + 100);
    const newMI: MajorIncidentRecord = {
      id: miId,
      name: data.name,
      description: data.description,
      provider: data.provider,
      category: data.category,
      severity: data.severity,
      active: true,
      ticketCount: 1,
      createdAt: new Date().toISOString(),
      status: 'INVESTIGATING',
      timeline: [{ id: 'tl-' + Date.now(), timestamp: new Date().toISOString(), author: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole === UserRole.PROVIDER ? 'Provider' : 'BU Support', message: `Major Incident declared. Severity set to ${data.severity}. System monitors deployed.` }],
      notifications: [{ id: 'not-' + Date.now(), timestamp: new Date().toISOString(), channel: data.initialNotification, recipient: data.initialNotification === 'Slack/Teams Webhook' ? '#ops-severity-1-war-room' : 'executive-alerts@company.com', subject: `CRITICAL OUTAGE WARNING: ${data.name}`, status: 'SENT' }],
      pir: { rootCauseSummary: '', timelineSummary: '', impactSummary: '', preventiveOwner: '', preventiveDueDate: '', draft: true, lastUpdated: new Date().toISOString(), lastUpdatedBy: currentUser.firstName + ' ' + currentUser.lastName }
    };
    const updatedMIs = [newMI, ...majorIncidents];
    setMajorIncidents(updatedMIs);
    const updatedTickets = tickets.map(t => {
      if (t.id === activeTicketId) {
        logAuditAction(t.id, 'MAJOR_INCIDENT_DECLARED', `Declared Major Incident: ${newMI.name}. Auto-linked ticket.`);
        return { ...t, majorIncidentId: miId, priority: TicketPriority.CRITICAL };
      }
      return t;
    });
    setTickets(updatedTickets);
    setSelectedMajorIncidentId(miId);
    syncMajorIncident(newMI);
    const linkedTicket = updatedTickets.find(t => t.id === activeTicketId);
    if (linkedTicket) syncTicketPatch(linkedTicket.id, { majorIncidentId: miId, priority: TicketPriority.CRITICAL });
    showToast(`Major Incident ${miId} declared and active!`, 'success');
    const targetTicket = updatedTickets.find(t => t.id === activeTicketId);
    if (targetTicket) {
      notifyWatchers(targetTicket, `Ticket ${targetTicket.id} has been automatically linked to Major Incident ${miId} (${newMI.name}) and upgraded to CRITICAL priority.`, updatedTickets);
    } else {
      saveToStorage(updatedTickets, comments, auditLogs, updatedMIs);
    }
  };

  

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Force a password change before granting access to the app (see server gate).
  if (app.mustChangePassword) {
    return <ChangePasswordRequiredPage />;
  }

  const effectiveTab = currentRole === UserRole.PARTNER ? 'partner_portal' : activeTab;

  // Role-based tab access guard
  const ROLE_TABS: Partial<Record<UserRole, string[]>> = {
    [UserRole.EXECUTIVE]: ['dashboard', 'audit_logs', 'watcher_notifications', 'major_incidents', 'kb', 'profile_settings'],
    [UserRole.BU_SUPPORT]: ['tickets', 'major_incidents', 'customers', 'partner_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings'],
    [UserRole.PROVIDER]: ['provider_portal', 'tickets', 'kb', 'profile_settings'],
    [UserRole.PARTNER]: ['partner_portal', 'kb', 'profile_settings'],
    [UserRole.SUPER_ADMIN]: ['tickets', 'major_incidents', 'dashboard', 'audit_logs', 'watcher_notifications', 'admin_settings', 'reference_data', 'kb', 'customers', 'partner_portal', 'provider_portal', 'profile_settings'],
  };
  const permissionTabs: string[] = [];
  if (can('tickets:view') || can('tickets:create')) permissionTabs.push('tickets', 'partner_portal');
  if (can('major-incidents:manage')) permissionTabs.push('major_incidents');
  if (can('customers:manage')) permissionTabs.push('customers');
  if (can('executive:dashboard')) permissionTabs.push('dashboard');
  if (can('audit:view')) permissionTabs.push('audit_logs');
  if (can('notifications:view')) permissionTabs.push('watcher_notifications');
  if (can('admin:config') || can('admin:access') || can('admin:users')) permissionTabs.push('admin_settings', 'reference_data');
  if (can('provider:rca') || can('tickets:view')) permissionTabs.push('provider_portal');
  permissionTabs.push('kb', 'profile_settings');
  const allowedTabs = ROLE_TABS[currentRole] || permissionTabs || ['profile_settings'];
  const safeTab = allowedTabs.includes(effectiveTab) ? effectiveTab : allowedTabs[0];
  const unreadNotificationCount = watcherNotifications.filter(
    (n: WatcherNotification) => !n.seen && n.recipient?.toLowerCase() === currentUser.email.toLowerCase()
  ).length;

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen w-full bg-app font-sans text-text-primary overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold">
        Skip to main content
      </a>

      {/* Top Bar */}
      {currentRole !== UserRole.PARTNER && (
      <div className="bg-surface-card border-b border-border-subtle px-4 lg:px-6 py-2 flex items-center justify-between z-50 shrink-0 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Shield className="w-4 h-4 text-accent" />
          <span className="text-caption text-text-muted font-medium hidden sm:inline">Tenant Portal Switchboard</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('watcher_notifications')}
            className="relative p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-150 focus-ring"
            aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-error text-white rounded-full flex items-center justify-center text-[9px] font-bold leading-none shadow-sm">
                {unreadNotificationCount}
              </span>
            )}
          </button>
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover hover:bg-surface-card rounded-lg text-xs font-medium text-text-primary transition-all duration-150 cursor-pointer border border-border-subtle"
            >
              <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">{currentUser.firstName.charAt(0)}</span>
              <span className="hidden sm:inline max-w-[140px] truncate text-text-secondary" title={currentUser.firstName + ' ' + currentUser.lastName}>{currentUser.firstName + ' ' + currentUser.lastName}</span>
              <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-surface-card border border-border rounded-xl shadow-dropdown z-50 overflow-hidden">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { handleRoleChange(u.role as UserRole); setUserMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-hover cursor-pointer ${
                      currentUser.email === u.email ? 'bg-accent/10' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-surface-hover text-text-muted">
                      {(u.firstName[0] + u.lastName[0]).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">{u.firstName + ' ' + u.lastName}</p>
                      <p className="text-caption text-text-muted truncate">{u.email}</p>
                      <p className="text-caption text-text-muted font-mono">{u.role} · {u.bu}</p>
                    </div>
                    {currentUser.email === u.email && (
                      <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-md font-semibold">Active</span>
                    )}
                  </button>
                ))}
                <div className="border-t border-border">
                  <button onClick={handleLogout} className="w-full px-4 py-2.5 text-xs font-semibold text-error hover:bg-error-light transition cursor-pointer text-left">
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentUser={currentUser}
          currentRole={currentRole}
          tickets={tickets}
          majorIncidents={majorIncidents}
          watcherNotifications={watcherNotifications}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-md focus:shadow-modal focus:outline-none focus:ring-2 focus:ring-accent-dark"
        >
          Skip to main content
        </a>

        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-y-auto bg-app scrollbar-gutter-stable">
        <PageErrorBoundary pageName="Workspace">

        <AnimatePresence mode="wait">
          <motion.div
            key={safeTab}
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <Suspense fallback={<RouteLoadingFallback />} className="flex-1">

          {safeTab === 'tickets' && (
            <TicketWorkspacePage handleDeclareMajorIncident={handleDeclareMajorIncident} />
          )}
          {safeTab === 'partner_portal' && <PartnerPortalPage />}
          {safeTab === 'dashboard' && <ExecutiveDashboardPage />}
          {safeTab === 'provider_portal' && <ProviderPortalPage />}
          {safeTab === 'customers' && <CustomersPage />}
          {safeTab === 'audit_logs' && (
            <AuditLogsPage auditLogs={auditLogs} showToast={showToast} searchQuery={searchQuery} />
          )}
          {safeTab === 'watcher_notifications' && (
            <WatcherNotificationsPage
              watcherNotifications={watcherNotifications}
              currentUser={currentUser}
              tickets={tickets}
              comments={comments}
              auditLogs={auditLogs}
              majorIncidents={majorIncidents}
              setWatcherNotifications={setWatcherNotifications}
              saveToStorage={saveToStorage}
              showToast={showToast}
              setActiveTicketId={setActiveTicketId}
              setActiveTab={setActiveTab}
            />
          )}

          {safeTab === 'kb' && (
            <div className="flex-1 overflow-y-auto h-full">
              <KnowledgeBaseTab
                articles={kbArticles}
                setArticles={updateKbArticles}
                currentRole={currentRole}
                currentUser={currentUser}
                showToast={showToast}
              />
            </div>
          )}

          {safeTab === 'major_incidents' && (
            <MajorIncidentsPage
              selectedMajorIncidentId={selectedMajorIncidentId}
              setSelectedMajorIncidentId={setSelectedMajorIncidentId}
              handleDeclareMajorIncident={handleDeclareMajorIncident}
            />
          )}

          {safeTab === 'admin_settings' && <AdminSettingsPage />}

          {safeTab === 'reference_data' && <ReferenceDataPage />}
          {safeTab === 'profile_settings' && <ProfileSettingsPage />}

            </Suspense>
          </motion.div>
        </AnimatePresence>
        </PageErrorBoundary>

        <footer className="h-9 bg-surface-card border-t border-border-subtle px-4 lg:px-8 flex items-center justify-between shrink-0 text-text-muted">
          <div className="flex items-center gap-4">
            <span className="text-caption font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-success rounded-full" />
              TLS 1.3 / AES-256
            </span>
            <span className="text-caption font-medium hidden sm:inline">10-Year GAID Compliance</span>
          </div>
          <span className="text-caption font-medium">4CoreFinSupport v1.0</span>
        </footer>

      </main>
      </div>

      <OnboardingTour />
      <CommandPalette />

    </div>
    </ErrorBoundary>
  );
}
