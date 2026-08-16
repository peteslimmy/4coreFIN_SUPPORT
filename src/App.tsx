import { useState, useEffect, useRef, Suspense, lazy, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Shield, ChevronDown, Menu } from 'lucide-react';

import ErrorBoundary from './components/ui/ErrorBoundary';
import PageErrorBoundary from './components/ui/PageErrorBoundary';
import Sidebar from './components/Sidebar';
import { KbArticle } from './types/admin';
import { UserRole, type WatcherNotification } from './types/app';
import { useApp } from './context/AppContext';
import { useUi } from './context/UiContext';
import { syncKbArticles } from './lib/sync';
import OnboardingTour from './components/onboarding/OnboardingTour';
import CommandPalette from './components/CommandPalette';
import BrandLogo from './components/BrandLogo';

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
    } catch (e: any) {
      showToast(e?.message || 'Declaration failed. Please try again.', 'error');
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
     return <LoginPage />;
   }

  // Force a password change before granting access to the app (see server gate).
  if (app.mustChangePassword) {
    return <ChangePasswordRequiredPage />;
  }

  const effectiveTab = currentRole === UserRole.CUSTOMER ? 'customer_portal' : activeTab;

  // Role-based tab access guard
  const ROLE_TABS: Partial<Record<UserRole, string[]>> = {
[UserRole.EXECUTIVE]: ['dashboard', 'audit_logs', 'watcher_notifications', 'major_incidents', 'kb', 'profile_settings'],
[UserRole.BU_SUPPORT]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings'],
[UserRole.BU_SUPPORT_L1]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings'],
[UserRole.BU_SUPPORT_L2]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings'],
[UserRole.BU_SUPPORT_L3]: ['tickets', 'major_incidents', 'customers', 'customer_portal', 'kb', 'audit_logs', 'watcher_notifications', 'profile_settings'],
[UserRole.PARTNER]: ['payment_partner_portal', 'tickets', 'major_incidents', 'kb', 'profile_settings'],
[UserRole.CUSTOMER]: ['customer_portal', 'kb', 'profile_settings'],
[UserRole.SUPER_ADMIN]: ['tickets', 'major_incidents', 'dashboard', 'audit_logs', 'watcher_notifications', 'admin_settings', 'reference_data', 'kb', 'customers', 'customer_portal', 'payment_partner_portal', 'profile_settings'],

  };
const permissionTabs: string[] = [];
if (can('tickets:view') || can('tickets:create')) permissionTabs.push('tickets', 'customer_portal');
if (can('major-incidents:manage')) permissionTabs.push('major_incidents');
if (can('customers:manage')) permissionTabs.push('customers');
if (can('executive:dashboard')) permissionTabs.push('dashboard');
if (can('audit:view')) permissionTabs.push('audit_logs');
if (can('notifications:view')) permissionTabs.push('watcher_notifications');
if (can('admin:config') || can('admin:access') || can('admin:users')) permissionTabs.push('admin_settings', 'reference_data');
if (can('partner:rca') || can('tickets:view')) permissionTabs.push('payment_partner_portal');
permissionTabs.push('ai_chat', 'kb', 'profile_settings');
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
      {currentRole !== UserRole.CUSTOMER && (
      <div className="bg-surface-card border-b border-border-subtle px-4 lg:px-6 py-2 flex items-center justify-between z-50 shrink-0 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BrandLogo
            imgClassName="h-5 w-auto object-contain shrink-0"
            fallback={<Shield className="w-4 h-4 text-accent" />}
          />
          <span className="text-caption text-text-muted font-medium hidden sm:inline">4CORE Payment Support</span>
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
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-hover/50">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-accent/15 text-accent">
                    {(currentUser.firstName[0] + currentUser.lastName[0]).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary truncate">{currentUser.firstName + ' ' + currentUser.lastName}</p>
                    <p className="text-caption text-text-muted truncate">{currentUser.email}</p>
                    <p className="text-caption text-text-muted font-mono">{currentRole} · {currentUser.bu || currentUser.partner}</p>
                  </div>
                </div>
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
