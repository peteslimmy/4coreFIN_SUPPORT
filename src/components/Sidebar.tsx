import { motion, AnimatePresence } from 'framer-motion';
import { Ticket, Activity, BarChart2, Lock, Bell, BookOpen, Plus, ChevronLeft, ChevronRight, ClipboardList, Users, Palette, User, X, LucideIcon, Database } from 'lucide-react';
import { useState } from 'react';
import { UserRole, TicketStatus, TicketRecord, MajorIncidentRecord, WatcherNotification } from '../types/app';
import Avatar from './ui/Avatar';
import ThemeToggle from './ThemeToggle';
interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: { firstName: string; lastName: string; email: string; bu: string; partner?: string; accountType?: string };
  currentRole: UserRole;
  tickets: TicketRecord[];
  majorIncidents: MajorIncidentRecord[];
  watcherNotifications: WatcherNotification[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number | 'alert';
  roles?: UserRole[];
  section: string;
  executive?: boolean;
}

function SidebarContent({ activeTab, setActiveTab, currentUser, currentRole, tickets, majorIncidents, watcherNotifications, collapsed, setCollapsed, onNavClick }: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: { firstName: string; lastName: string; email: string; bu: string; partner?: string; accountType?: string };
  currentRole: UserRole;
  tickets: TicketRecord[];
  majorIncidents: MajorIncidentRecord[];
  watcherNotifications: WatcherNotification[];
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onNavClick?: () => void;
}) {
  const isExecutive = currentRole === UserRole.EXECUTIVE;
  const unreadWatcherCount = watcherNotifications.filter(
    (n: WatcherNotification) => !n.seen && n.recipient?.toLowerCase() === currentUser.email.toLowerCase()
  ).length;
  const activeTicketsCount = (() => {
    let scoped = tickets;
    if (currentRole !== UserRole.SUPER_ADMIN && currentRole !== UserRole.EXECUTIVE) {
      scoped = currentRole === UserRole.PARTNER
        ? tickets.filter(t => t.assignedAgentId?.toLowerCase().includes((currentUser.partner || currentUser.bu || '').toLowerCase()))
        : tickets.filter(t => t.businessUnit === currentUser.bu);
    }
    return scoped.filter(t => t.status !== TicketStatus.CLOSED).length;
  })();

  const allNavItems: NavItem[] = [
    { id: 'tickets', label: 'Ticket Workspace', icon: Ticket, badge: activeTicketsCount, section: 'Operations' },
    { id: 'major_incidents', label: 'Major Incidents', icon: Activity, badge: majorIncidents.length, section: 'Operations' },
    { id: 'dashboard', label: 'Performance Desk', icon: BarChart2, section: 'Analytics & Executive', executive: true },
    { id: 'audit_logs', label: 'Audit Logs', icon: Lock, section: 'Compliance' },
    { id: 'watcher_notifications', label: 'Watcher Alerts', icon: Bell, badge: unreadWatcherCount, section: 'Compliance' },
    { id: 'reference_data', label: 'Reference Data', icon: Database, roles: [UserRole.SUPER_ADMIN], section: 'Administration' },
    { id: 'admin_settings', label: 'Customization', icon: Palette, roles: [UserRole.SUPER_ADMIN], section: 'Administration' },
  { id: 'kb', label: 'Knowledge Base', icon: BookOpen, section: 'Knowledge' },
  { id: 'customers', label: 'Customers', icon: Users, roles: [UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.SUPER_ADMIN], section: 'Operations' },
    { id: 'customer_portal', label: 'Log Complaint', icon: Plus, roles: [UserRole.CUSTOMER, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.SUPER_ADMIN], section: 'Complaints' },
    { id: 'payment_partner_portal', label: 'Payment Partner Portal', icon: ClipboardList, roles: [UserRole.PARTNER], section: 'Payment Partner Desk' },
    { id: 'profile_settings', label: 'Profile & Security', icon: User, section: 'Account' },
  ];

  // Filter items by role and executive relevance
  const navItems = allNavItems.filter(item => {
    if (item.roles && !item.roles.includes(currentRole)) return false;
    if (isExecutive && !item.executive && item.section !== 'Account' && item.id !== 'profile_settings') return false;
    if (!isExecutive && item.executive) return false;
    return true;
  });

  const groupedItems = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <>
      <nav aria-label="Main navigation" className={`flex-1 overflow-y-auto ${collapsed ? 'px-2 py-3' : 'px-2 py-3'} space-y-1`}>
        {Object.entries(groupedItems).map(([section, items]) => (
          <div key={section}>
            {!collapsed && (
              <div className="text-overline px-3 py-3">{section}</div>
            )}
            {items.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); onNavClick?.(); }}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={`w-full flex items-center rounded-lg text-left transition-all duration-150 focus-ring relative ${
                    collapsed ? 'justify-center p-2.5' : 'gap-3 pl-3 pr-2.5 py-2'
                  } ${
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-muted hover:text-text-secondary hover:bg-surface-card font-medium'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-r-full" />
                  )}
                  <Icon className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'} ${isActive ? 'text-accent' : ''}`} />
                  {!collapsed && (
                    <>
                      <span className="text-[13px] flex-1 truncate">{item.label}</span>
                      {item.badge !== undefined && typeof item.badge === 'number' && item.badge > 0 && (
                        <span className={`text-[10px] font-mono font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-md px-1 ${
                          item.id === 'watcher_notifications'
                            ? 'bg-accent/15 text-accent'
                            : item.id === 'major_incidents'
                            ? 'bg-error/15 text-error'
                            : 'bg-surface-hover text-text-muted'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border-subtle">
        {collapsed ? (
          <div className="p-2 flex flex-col items-center gap-2">
            <ThemeToggle collapsed />
          </div>
        ) : (
          <ThemeToggle />
        )}
      </div>
      <div className={`border-t border-border-subtle ${collapsed ? 'p-2' : 'p-3'}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <Avatar name={currentUser.firstName + ' ' + currentUser.lastName} size="sm" />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={currentUser.firstName + ' ' + currentUser.lastName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary truncate">{currentUser.firstName + ' ' + currentUser.lastName}</p>
              <p className="text-caption text-text-muted truncate">
                {currentUser.bu || currentUser.partner}
              </p>
            </div>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-card transition-colors focus-ring shrink-0"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        )}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="w-full mt-2 flex justify-center p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-card transition-colors focus-ring"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </>
  );
}

export default function Sidebar({ activeTab, setActiveTab, currentUser, currentRole, tickets, majorIncidents, watcherNotifications, mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const desktopSidebar = (
    <motion.aside
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="hidden lg:flex bg-surface-sidebar flex-col border-r border-border-subtle shrink-0 overflow-hidden z-30"
    >
      <SidebarContent
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        currentRole={currentRole}
        tickets={tickets}
        majorIncidents={majorIncidents}
        watcherNotifications={watcherNotifications}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
    </motion.aside>
  );

  const mobileSidebar = (
    <AnimatePresence>
      {mobileOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-overlay z-40 lg:hidden"
            onClick={onMobileClose}
          />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="fixed inset-y-0 left-0 w-72 bg-surface-sidebar z-50 lg:hidden flex flex-col shadow-modal"
          >
            <div className="flex items-center justify-end p-4 border-b border-border-subtle">
              <button onClick={onMobileClose} className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-card transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              currentUser={currentUser}
              currentRole={currentRole}
              tickets={tickets}
              majorIncidents={majorIncidents}
              watcherNotifications={watcherNotifications}
              collapsed={false}
              setCollapsed={() => {}}
              onNavClick={onMobileClose}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {desktopSidebar}
      {mobileSidebar}
    </>
  );
}
