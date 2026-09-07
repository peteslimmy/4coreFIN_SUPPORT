import { motion } from 'framer-motion';
import React, { useMemo } from 'react';
import { Ticket, BarChart2, Bell, User, Plus, Menu, Activity, BookOpen, Sparkles, Layers, Star, ShieldAlert, FileBarChart } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { UserRole } from '../../types/app';

interface BottomNavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  tickets?: { length: number };
  watcherNotifications?: { seen: boolean; recipient?: string }[];
  majorIncidents?: { length: number };
  currentUser?: { email: string };
}

const allNavItems = [
  { id: 'tickets', label: 'Tickets', icon: Ticket, roles: [UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.SUPER_ADMIN, UserRole.PARTNER, UserRole.EXECUTIVE] },
  { id: 'customer_portal', label: 'Complaint', icon: Plus, roles: [UserRole.CUSTOMER, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.SUPER_ADMIN] },
  { id: 'payment_partner_portal', label: 'Partner', icon: Ticket, roles: [UserRole.PARTNER] },
  { id: 'dashboard', label: 'Performance', icon: BarChart2, roles: [UserRole.SUPER_ADMIN, UserRole.EXECUTIVE, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3] },
  { id: 'major_incidents', label: 'Incidents', icon: Activity, roles: [UserRole.SUPER_ADMIN, UserRole.EXECUTIVE, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.PARTNER] },
  { id: 'watcher_notifications', label: 'Alerts', icon: Bell, roles: [UserRole.SUPER_ADMIN, UserRole.EXECUTIVE, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.PARTNER] },
  { id: 'kb', label: 'Knowledge', icon: BookOpen, roles: [UserRole.SUPER_ADMIN, UserRole.EXECUTIVE, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.PARTNER, UserRole.CUSTOMER] },
  { id: 'ai_copilot', label: 'AI Copilot', icon: Sparkles, roles: [UserRole.SUPER_ADMIN, UserRole.EXECUTIVE, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.PARTNER] },
  { id: 'profile_settings', label: 'Profile', icon: User, roles: [UserRole.SUPER_ADMIN, UserRole.EXECUTIVE, UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3, UserRole.PARTNER, UserRole.CUSTOMER] },
];

const BottomNavigation = React.memo(function BottomNavigation({
  activeTab,
  setActiveTab,
  currentRole,
  tickets,
  watcherNotifications,
  majorIncidents,
  currentUser,
}: BottomNavigationProps) {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  
  if (!isMobile) return null;

  const unreadCount = currentUser && watcherNotifications 
    ? watcherNotifications.filter((n: any) => !n.seen && n.recipient?.toLowerCase() === currentUser.email.toLowerCase()).length
    : 0;

  const activeCount = tickets?.length || 0;
  const miCount = majorIncidents?.length || 0;

  const filteredItems = allNavItems.filter(item => item.roles.includes(currentRole));

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      exit={{ y: 100 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-surface-card border-t border-border-subtle safe-area-bottom"
      role="navigation"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          let badge: number | undefined;
          
          if (item.id === 'tickets') badge = activeCount;
          else if (item.id === 'major_incidents') badge = miCount;
          else if (item.id === 'watcher_notifications') badge = unreadCount;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 transition-all duration-200 relative ${
                isActive
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <span className="relative">
                <Icon className={`w-6 h-6 ${isActive ? 'text-accent' : ''}`} aria-hidden="true" />
                {badge !== undefined && badge > 0 && (
                  <span className={`absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
                    item.id === 'watcher_notifications'
                      ? 'bg-accent text-[#fff]'
                      : item.id === 'major_incidents'
                      ? 'bg-error text-[#fff]'
                      : 'bg-primary text-[#fff]'
                  }`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${isActive ? 'text-accent' : 'text-text-muted'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
});

export default BottomNavigation;