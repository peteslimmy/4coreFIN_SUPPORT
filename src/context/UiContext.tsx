import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode, type Dispatch, type SetStateAction } from 'react';

export interface UiDomain {
  commentText: string;
  setCommentText: Dispatch<SetStateAction<string>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  priorityFilter: string;
  setPriorityFilter: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  activeTab: string;
  setActiveTab: Dispatch<SetStateAction<string>>;
  activeTicketId: string;
  setActiveTicketId: Dispatch<SetStateAction<string>>;
  compactDensity: boolean;
  setCompactDensity: Dispatch<SetStateAction<boolean>>;
}

const UiContext = createContext<UiDomain | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}

// ─── URL <-> UI state ───────────────────────────────────────────────────
// Tab and ticket selection are mirrored into the URL so views are deep-
// linkable and the browser back button works, without remounting the SPA.
// Route shape: /app/<tab>?ticket=<id>. Public/auth paths are untouched.

const DEFAULT_TAB = 'tickets';
const KNOWN_TABS = new Set([
  'tickets', 'customer_portal', 'dashboard', 'payment_partner_portal',
  'customers', 'audit_logs', 'watcher_notifications', 'kb',
  'major_incidents', 'admin_settings', 'reference_data', 'profile_settings',
  'notifications', 'ai_copilot',
]);

function isAppPath(): boolean {
  const p = window.location.pathname;
  // Public/auth/legal routes render outside the shell and manage themselves.
  return !(p.startsWith('/auth') || p === '/reset-password' || p === '/privacy-policy' || p === '/privacy');
}

function readUrlState(): { tab: string; ticketId: string } {
  if (!isAppPath()) return { tab: DEFAULT_TAB, ticketId: '' };
  const tab = window.location.pathname.replace(/^\/app\/?/, '').split('/')[0];
  const ticketId = new URLSearchParams(window.location.search).get('ticket') || '';
  return {
    tab: KNOWN_TABS.has(tab) ? tab : DEFAULT_TAB,
    ticketId,
  };
}

function writeUrlState(tab: string, ticketId: string, replace = false): void {
  if (!isAppPath()) return;
  const path = `/app/${tab}`;
  const search = ticketId ? `?ticket=${encodeURIComponent(ticketId)}` : '';
  const url = `${path}${search}`;
  if (`${window.location.pathname}${window.location.search}` !== url) {
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readUrlState);
  const [commentText, setCommentText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<string>(initial.tab);
  const [activeTicketId, setActiveTicketId] = useState<string>(initial.ticketId);
  const [compactDensity, setCompactDensity] = useState<boolean>(false);

  // External navigation (back/forward) restores tab + ticket selection
  // without remounting the application.
  useEffect(() => {
    const onPopState = () => {
      const next = readUrlState();
      setActiveTab((prev) => (prev === next.tab ? prev : next.tab));
      setActiveTicketId((prev) => (prev === next.ticketId ? prev : next.ticketId));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Mirror programmatic changes into the URL (replace on first paint so the
  // initial default tab doesn't pollute history).
  const urlSyncedRef = useRef(false);
  useEffect(() => {
    if (!isAppPath()) return;
    writeUrlState(activeTab, activeTicketId, !urlSyncedRef.current);
    urlSyncedRef.current = true;
  }, [activeTab, activeTicketId]);

  const value = useMemo(() => ({
    commentText, setCommentText,
    searchQuery, setSearchQuery,
    priorityFilter, setPriorityFilter,
    statusFilter, setStatusFilter,
    activeTab, setActiveTab,
    activeTicketId, setActiveTicketId,
    compactDensity, setCompactDensity,
  }), [commentText, searchQuery, priorityFilter, statusFilter, activeTab, activeTicketId, compactDensity]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}
