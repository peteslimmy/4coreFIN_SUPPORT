import { useState, useRef, useEffect, Suspense, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Shield, ChevronDown, Menu } from 'lucide-react';

import BrandLogo from '../BrandLogo';
import Sidebar from '../Sidebar';
import CommandPalette from '../CommandPalette';
import BottomNavigation from './BottomNavigation';
import { UserRole, type TicketRecord, type MajorIncidentRecord, type WatcherNotification } from '../../types/app';

const APP_NAME = '4CORE Payment Support';
const APP_VERSION = '4CoreFinSupport v1.0';

/* ─── Props ─────────────────────────────────────────────────────────── */

interface AppShellProps {
  children: ReactNode;
  currentUser: { firstName: string; lastName: string; email: string; bu: string; partner?: string; accountType?: string };
  currentRole: UserRole;
  tickets: TicketRecord[];
  majorIncidents: MajorIncidentRecord[];
  watcherNotifications: WatcherNotification[];
  activeTab: string;
  setActiveTab: Dispatch<SetStateAction<string>>;
  handleLogout: () => void;
}

/* ─── Route Loading Fallback ────────────────────────────────────────── */

function RouteLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center p-8" role="status" aria-live="polite" aria-label="Loading page">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-body-sm text-text-muted">Loading…</p>
      </div>
    </div>
  );
}

/* ─── TopBar ────────────────────────────────────────────────────────── */

import React from 'react';

const TopBar = React.memo(function TopBar({
  currentUser,
  currentRole,
  watcherNotifications,
  mobileMenuOpen: _mobileMenuOpen,
  setMobileMenuOpen,
  setActiveTab,
  handleLogout,
}: {
  currentUser: AppShellProps['currentUser'];
  currentRole: UserRole;
  watcherNotifications: WatcherNotification[];
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  setActiveTab: Dispatch<SetStateAction<string>>;
  handleLogout: () => void;
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadNotificationCount = watcherNotifications.filter(
    (n: WatcherNotification) => !n.seen && n.recipient?.toLowerCase() === currentUser.email.toLowerCase()
  ).length;

  return (
    <div className="bg-surface-card border-b border-border-subtle px-4 lg:px-6 py-2 flex items-center justify-between z-50 shrink-0 gap-2 relative">
      {/* Left: brand + mobile menu trigger */}
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
          fallback={<Shield className="w-4 h-4 text-primary" />}
        />
        <span className="text-caption text-text-muted font-medium hidden sm:inline">{APP_NAME}</span>
      </div>

      {/* Right: search + notifications + user */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('watcher_notifications')}
          className="relative p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-150 focus-ring"
          aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-error text-[#fff] rounded-full flex items-center justify-center text-[9px] font-bold leading-none shadow-sm">
              {unreadNotificationCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover hover:bg-surface-card rounded-lg text-xs font-medium text-text-primary transition-all duration-150 cursor-pointer border border-border-subtle"
          >
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{currentUser.firstName.charAt(0)}</span>
            <span className="hidden sm:inline max-w-[140px] truncate text-text-secondary" title={currentUser.firstName + ' ' + currentUser.lastName}>{currentUser.firstName + ' ' + currentUser.lastName}</span>
            <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-2 w-64 bg-surface-card border border-border rounded-xl shadow-dropdown z-50 overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-hover/50">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-primary/15 text-primary">
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
});

/* ─── AppShell ──────────────────────────────────────────────────────── */

export default function AppShell({
  children,
  currentUser,
  currentRole,
  tickets,
  majorIncidents,
  watcherNotifications,
  activeTab,
  setActiveTab,
  handleLogout,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen w-full bg-app font-sans text-text-primary overflow-hidden">
      {/* Skip link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-[#fff] focus:rounded-lg focus:text-sm focus:font-semibold">
        Skip to main content
      </a>

      {/* Top bar — hidden for customers */}
      {currentRole !== UserRole.CUSTOMER && (
        <TopBar
          currentUser={currentUser}
          currentRole={currentRole}
          watcherNotifications={watcherNotifications}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          setActiveTab={setActiveTab}
          handleLogout={handleLogout}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
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

        {/* Main content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-[#fff] focus:rounded-md focus:shadow-modal focus:outline-none focus:ring-2 focus:ring-primary-dark"
        >
          Skip to main content
        </a>

        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 flex flex-col overflow-y-auto bg-app scrollbar-gutter-stable lg:pb-6 pb-20">
          <PageErrorBoundaryWrapper>
            <Suspense fallback={<RouteLoadingFallback />} className="flex-1">
              {children}
            </Suspense>
          </PageErrorBoundaryWrapper>

          {/* Subtle footer with version only */}
          <div className="h-6 bg-surface-card border-t border-border-subtle px-4 lg:px-8 flex items-center justify-between shrink-0 text-caption text-text-muted lg:block hidden">
            <span className="hidden sm:inline">4CoreFinSupport v1.0</span>
            <span className="text-xs text-text-muted/70">© {new Date().getFullYear()} 4Core</span>
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNavigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentRole={currentRole}
        tickets={tickets}
        watcherNotifications={watcherNotifications}
        majorIncidents={majorIncidents}
        currentUser={currentUser}
      />

      {/* Global overlays */}
      <CommandPalette />
    </div>
  );
}

/* ─── PageErrorBoundary wrapper (lazy to avoid circular dep) ──────── */

import PageErrorBoundary from '../ui/PageErrorBoundary';

function PageErrorBoundaryWrapper({ children }: { children: ReactNode }) {
  return (
    <PageErrorBoundary pageName="Workspace">
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </PageErrorBoundary>
  );
}
