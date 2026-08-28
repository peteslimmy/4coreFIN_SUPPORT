import { useState, lazy, type SetStateAction } from 'react';

import ErrorBoundary from './components/ui/ErrorBoundary';
import AppShell from './components/layout/AppShell';
import { KbArticle } from './types/admin';
import { UserRole } from './types/app';
import { useApp } from './context/AppContext';
import { useUi } from './context/UiContext';
import { syncKbArticles } from './lib/sync';
import OnboardingTour from './components/onboarding/OnboardingTour';

const KnowledgeBaseTab = lazy(() => import('./components/KnowledgeBaseTab'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const WatcherNotificationsPage = lazy(() => import('./pages/WatcherNotificationsPage'));
const CustomerPortalPage = lazy(() => import('./pages/CustomerPortalPage'));
const ExecutiveDashboardPage = lazy(() => import('./pages/ExecutiveDashboardPage'));
const MajorIncidentsPage = lazy(() => import('./pages/MajorIncidentsPage'));
const TicketWorkspacePage = lazy(() => import('./pages/TicketWorkspacePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PaymentPartnerPortalPage = lazy(() => import('./pages/PaymentPartnerPortalPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const ReferenceDataPage = lazy(() => import('./pages/ReferenceDataPage'));
const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const ChangePasswordRequiredPage = lazy(() => import('./pages/ChangePasswordRequiredPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
// New pages for additional modules
const NotificationPreferencesPage = lazy(() => import('./pages/NotificationPreferencesPage'));

export default function App() {
  const app = useApp();
  const ui = useUi();
  const {
    isAuthenticated, currentRole, currentUser, handleLogout,
    tickets, setTickets, comments,
    auditLogs, watcherNotifications, setWatcherNotifications,
    majorIncidents, setMajorIncidents,
    users, slaRules, holidays, ticketTemplates,
    kbArticles, setKbArticles,
    showToast, logAuditAction, saveToStorage, notifyWatchers, can,
  } = app;
  const { activeTab, setActiveTab, activeTicketId, setActiveTicketId } = ui;

  const [selectedMajorIncidentId, setSelectedMajorIncidentId] = useState<string | null>('MI-001');

  const updateKbArticles = (newArticles: SetStateAction<KbArticle[]>) => {
    setKbArticles(prev => {
      const updated = typeof newArticles === 'function' ? newArticles(prev) : newArticles;
      saveToStorage(tickets, comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, updated);
      syncKbArticles(updated);
      return updated;
    });
  };

  const handleDeclareMajorIncident = async (formData: {
    name: string; description: string; partner: string; category: string; severity: string; initialNotification: string;
    affectedPartners?: string[]; affectedBus?: string[]; impact?: { description: string; customerCount?: string; amount?: string };
    expectedRto?: string; severityJustification?: string; recipient?: string; links?: string[];
  }): Promise<string | undefined> => {
    if (!formData.name.trim() || !formData.description.trim()) {
      showToast('Please provide a name and description for the Major Incident.', 'error');
      return undefined;
    }
    try {
      const { api } = await import('./lib/api');
      const created = await api.createMajorIncident({
        name: formData.name.trim(),
        description: formData.description.trim(),
        partner: formData.partner || '',
        category: formData.category || '',
        severity: formData.severity,
        affectedPartners: formData.affectedPartners || [],
        affectedBus: formData.affectedBus || [],
        ...(formData.severityJustification ? { severityJustification: formData.severityJustification } : {}),
        ...(formData.expectedRto ? { expectedRto: formData.expectedRto } : {}),
        initialNotification: formData.initialNotification,
        recipient: formData.initialNotification && /executive|email/i.test(formData.initialNotification) ? 'executive-alerts@company.com' : undefined,
        links: formData.links?.length ? formData.links : (activeTicketId ? [activeTicketId] : []),
      });
      setMajorIncidents(prev => [created, ...prev.filter(m => m.id !== created.id)]);
      if (activeTicketId) {
        const upd = tickets.map(t => t.id === activeTicketId ? { ...t, majorIncidentId: created.id, priority: 'CRITICAL' } : t);
        setTickets(upd);
        const targetTicket = upd.find(t => t.id === activeTicketId);
        if (targetTicket) {
          logAuditAction(targetTicket.id, 'MAJOR_INCIDENT_DECLARED', `Declared Major Incident: ${created.name}. Auto-linked ticket.`);
          notifyWatchers(targetTicket, `Ticket ${targetTicket.id} has been automatically linked to Major Incident ${created.id} (${created.name}) and upgraded to CRITICAL priority.`, upd);
        }
      }
      showToast(`Major Incident ${created.id} declared and active!`, 'success');
      return created.id;
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Declaration failed. Please try again.', 'error');
      return undefined;
    }
  };

  

   // Path-based routing for standalone public/auth/legal pages. Supabase recovery
   // tokens arrive in the URL hash (e.g. /reset-password#access_token=...),
   // so routing is path-based, never hash-based.
   const { pathname } = window.location;
   if (pathname === '/auth/login' && !isAuthenticated) {
     return <LoginPage />;
   }
   if (pathname === '/auth/forgot-password') {
     return <ForgotPasswordPage />;
   }
   if (pathname === '/auth/reset-password' || pathname === '/reset-password') {
     return <ResetPasswordPage />;
   }
   if (pathname === '/privacy-policy' || pathname === '/privacy') {
     return <PrivacyPolicyPage />;
   }

   if (!isAuthenticated) {
     // "/" intentionally renders the split landing/login screen directly
     // (see e2e/auth.spec.ts "Public landing page"); standalone routes below.
     return <LoginPage />;
   }

  // Force a password change before granting access to the app (see server gate).
  if (app.mustChangePassword) {
    return <ChangePasswordRequiredPage />;
  }

  const effectiveTab = currentRole === UserRole.CUSTOMER ? 'customer_portal' : activeTab;

// Role-based tab access guard
  const ROLE_TABS: Partial<Record<UserRole, string[]>> = {
    [UserRole.EXECUTIVE]: ['dashboard', 'audit_logs', 'watcher_notifications', 'major_incidents', 'kb', 'profile_settings', 'notifications'],
    [UserRole.BU_SUPPORT]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings', 'notifications'],
    [UserRole.BU_SUPPORT_L1]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings', 'notifications'],
    [UserRole.BU_SUPPORT_L2]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings', 'notifications'],
    [UserRole.BU_SUPPORT_L3]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings', 'notifications'],
    [UserRole.PARTNER]: ['payment_partner_portal', 'tickets', 'major_incidents', 'kb', 'profile_settings'],
    [UserRole.CUSTOMER]: ['customer_portal', 'kb', 'profile_settings'],
    [UserRole.SUPER_ADMIN]: ['tickets', 'major_incidents', 'dashboard', 'audit_logs', 'watcher_notifications', 'admin_settings', 'reference_data', 'kb', 'customers', 'customer_portal', 'payment_partner_portal', 'profile_settings', 'notifications'],
  };

  const permissionTabs: string[] = [];
  if (can('tickets:view') || can('tickets:create')) permissionTabs.push('tickets', 'customer_portal');
  if (can('major-incidents:manage')) permissionTabs.push('major_incidents');
  if (can('customers:manage')) permissionTabs.push('customers');
  if (can('executive:dashboard')) permissionTabs.push('dashboard');
  if (can('audit:view')) permissionTabs.push('audit_logs');
  if (can('notifications:view')) permissionTabs.push('watcher_notifications', 'notifications');
  if (can('admin:config') || can('admin:access') || can('admin:users')) permissionTabs.push('admin_settings', 'reference_data');
  if (can('partner:rca') || can('tickets:view')) permissionTabs.push('payment_partner_portal');
  if (can('notifications:manage')) permissionTabs.push('notifications');
  if (can('ai:use')) permissionTabs.push('ai_copilot');
  permissionTabs.push('kb', 'profile_settings');
  const allowedTabs = ROLE_TABS[currentRole] || permissionTabs || ['profile_settings'];
  const safeTab = allowedTabs.includes(effectiveTab) ? effectiveTab : allowedTabs[0];
  return (
    <ErrorBoundary>
      <AppShell
        currentUser={currentUser}
        currentRole={currentRole}
        tickets={tickets}
        majorIncidents={majorIncidents}
        watcherNotifications={watcherNotifications}
        activeTab={safeTab}
        setActiveTab={setActiveTab}
        handleLogout={handleLogout}
      >
        {safeTab === 'tickets' && (
          <TicketWorkspacePage handleDeclareMajorIncident={handleDeclareMajorIncident} />
        )}
        {safeTab === 'customer_portal' && <CustomerPortalPage />}
        {safeTab === 'dashboard' && <ExecutiveDashboardPage />}
        {safeTab === 'payment_partner_portal' && <PaymentPartnerPortalPage />}
        {safeTab === 'customers' && <CustomersPage />}
        {safeTab === 'audit_logs' && (
          <AuditLogsPage auditLogs={auditLogs} showToast={showToast} />
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
        {safeTab === 'notifications' && <NotificationPreferencesPage />}
      </AppShell>

      <OnboardingTour />
    </ErrorBoundary>
  );
}
