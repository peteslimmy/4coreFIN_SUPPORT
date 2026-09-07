import React from 'react';
import { motion } from 'framer-motion';
import { useTicketUI } from '../../context/TicketUIContext';
import { MessageSquare, Eye, Search } from 'lucide-react';

interface TabNavigationProps {
  activeTicket?: any;
  slaConfig?: any;
}

const tabs = [
  { id: 'overview' as const, label: 'Overview', icon: Eye },
  { id: 'investigation' as const, label: 'Investigation', icon: Search },
  { id: 'activity' as const, label: 'Activity', icon: MessageSquare },
] as const;

export function TabNavigation({ activeTicket: _activeTicket }: TabNavigationProps) {
  const { state: uiState, actions: uiActions } = useTicketUI();
  const activeTab = uiState.activeTab;

  return (
    <nav
      className="flex items-center border-b border-border px-3 scrollbar-hide"
      role="tablist"
      aria-label="Ticket detail sections"
      style={{ minHeight: '44px' }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        const panelId = `tabpanel-${tab.id}`;
        const tabId = `tab-${tab.id}`;

        return (
          <button
            key={tab.id}
            id={tabId}
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => uiActions.setTab(tab.id as any)}
            className={`
              relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold
              transition-colors duration-150 focus-ring
              ${isActive
                ? 'text-primary'
                : 'text-text-muted hover:text-text-primary'
              }
            `}
            style={{ minWidth: 'fit-content' }}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {tab.label}
            {isActive && (
              <motion.span
                layoutId="ticket-tab-underline"
                className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}