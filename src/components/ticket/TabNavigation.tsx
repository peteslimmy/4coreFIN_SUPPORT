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
      className="flex items-center gap-1 border-b border-border px-3 scrollbar-hide relative"
      role="tablist"
      aria-label="Ticket detail sections"
      style={{ minHeight: '40px' }}
    >
      <div className="flex items-center gap-1" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const panelId = `tabpanel-${tab.id}`;
          const tabId = `tab-${tab.id}`;

          return (
            <motion.button
              key={tab.id}
              id={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => uiActions.setTab(tab.id as any)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold
                border-b-2 transition-all duration-200 focus-ring -mb-px
                relative z-10
                ${isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary hover:bg-surface-hover/50'
                }
              `}
              style={{ minWidth: 'fit-content' }}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {tab.label}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}