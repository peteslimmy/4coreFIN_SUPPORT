import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, Users, FileText } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useApp } from '../../context/AppContext';
import { useTicketUI } from '../../context/TicketUIContext';
import { IntelligencePanel } from '../ticket/IntelligencePanel';
import { WatchersPanel } from '../ticket/WatchersPanel';
import { AuditPanel } from '../ticket/AuditPanel';
import type { TicketRecord } from '../../types/app';
import type { SlaRule } from '../../types/admin';

const drawerTabs = [
  { id: 'intelligence' as const, label: 'Intelligence', icon: Brain },
  { id: 'watchers' as const, label: 'Watchers', icon: Users },
  { id: 'audit' as const, label: 'Audit Trail', icon: FileText },
] as const;

interface DrawerTabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  key?: string; // React's key prop for list reconciliation
}

function DrawerTabButton({ active, onClick, icon: Icon, label }: DrawerTabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-ring ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function DrawerContent({ activeTicket, selectedWatcherIds, setSelectedWatcherIds, newWatcherEmail, setNewWatcherEmail, setNotifyWatcherModal, setRemoveWatcherConfirm, slaConfig }: {
  activeTicket: TicketRecord;
  selectedWatcherIds: Set<string>;
  setSelectedWatcherIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  newWatcherEmail: string;
  setNewWatcherEmail: (v: string) => void;
  setNotifyWatcherModal: (v: { isOpen: boolean; watcherEmail: string | null }) => void;
  setRemoveWatcherConfirm: (v: string | null) => void;
  slaConfig: {
    slaRules: SlaRule[];
    holidays: { date: string; name: string }[];
    priorityFallbackHours: Record<string, number>;
  };
}) {
  const { state: uiState, actions: uiActions } = useTicketUI();
  const activeTab = uiState.drawerTab;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Details
        </h2>
        <button
          onClick={uiActions.toggleDrawer}
          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors focus-ring"
          aria-label="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1 px-3 pb-3 border-b border-border shrink-0" role="tablist" aria-label="Drawer sections">
        {drawerTabs.map(tab => (
          <DrawerTabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => uiActions.setDrawerTab(tab.id)}
            icon={tab.icon}
            label={tab.label}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <AnimatePresence mode="wait">
          {activeTab === 'intelligence' && (
            <motion.div
              key="intelligence"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <IntelligencePanel ticket={activeTicket} slaConfig={slaConfig} />
            </motion.div>
          )}
          {activeTab === 'watchers' && (
            <motion.div
              key="watchers"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <WatchersPanel
                ticket={activeTicket}
                selectedWatcherIds={selectedWatcherIds}
                setSelectedWatcherIds={setSelectedWatcherIds}
                newWatcherEmail={newWatcherEmail}
                setNewWatcherEmail={setNewWatcherEmail}
                setNotifyWatcherModal={setNotifyWatcherModal}
                setRemoveWatcherConfirm={setRemoveWatcherConfirm}
              />
            </motion.div>
          )}
          {activeTab === 'audit' && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <AuditPanel ticket={activeTicket} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface RightDrawerProps {
  activeTicket: TicketRecord | null;
  selectedWatcherIds: Set<string>;
  setSelectedWatcherIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  newWatcherEmail: string;
  setNewWatcherEmail: (v: string) => void;
  setNotifyWatcherModal: (v: { isOpen: boolean; watcherEmail: string | null }) => void;
  setRemoveWatcherConfirm: (v: string | null) => void;
  slaConfig: {
    slaRules: SlaRule[];
    holidays: { date: string; name: string }[];
    priorityFallbackHours: Record<string, number>;
  };
}

export function RightDrawer({
  activeTicket,
  selectedWatcherIds,
  setSelectedWatcherIds,
  newWatcherEmail,
  setNewWatcherEmail,
  setNotifyWatcherModal,
  setRemoveWatcherConfirm,
  slaConfig,
}: RightDrawerProps) {
  const { state: uiState, actions: uiActions } = useTicketUI();
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const isTablet = useMediaQuery('(min-width: 1024px) and (max-width: 1279px)');
  const isSmallMobile = useMediaQuery('(max-width: 767px)');

  if (!activeTicket) return null;

  const drawerProps = {
    activeTicket,
    selectedWatcherIds,
    setSelectedWatcherIds,
    newWatcherEmail,
    setNewWatcherEmail,
    setNotifyWatcherModal,
    setRemoveWatcherConfirm,
    slaConfig,
  };

  if (isDesktop) {
    return (
      <div className="hidden xl:block w-[360px] shrink-0 border-l border-border flex flex-col h-full">
        <DrawerContent {...drawerProps} />
      </div>
    );
  }

  return (
    <Dialog.Root open={uiState.drawerOpen} onOpenChange={uiActions.setDrawerOpen}>
      <Dialog.Trigger asChild>
        <button className="hidden xl:flex" aria-label="Open details drawer" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          className={`
            glass-surface-strong flex flex-col
            ${isSmallMobile ? 'inset-0 rounded-none' : 'max-h-[90vh] rounded-t-2xl rounded-b-2xl'}
            ${isSmallMobile ? 'w-full' : 'w-[360px]'}
            ${isTablet ? 'right-0' : ''}
          `}
          onOpenAutoFocus={(e) => e.preventDefault()}
          side={isTablet ? 'right' : undefined}
        >
          <DrawerContent {...drawerProps} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FABCluster({ activeTicket }: { activeTicket: TicketRecord | null }) {
   const { state: uiState, actions: uiActions } = useTicketUI();
   const isDesktop = useMediaQuery('(min-width: 1280px)');
   const { watcherNotifications } = useApp();

   if (isDesktop || !activeTicket) return null;
  const watcherCount = activeTicket.watchers?.length || 0;
  const hasUnreadNotifications = watcherNotifications.some(n =>
    n.ticketId === activeTicket.id && !n.seen
  );

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
      <AnimatePresence>
        {uiState.drawerOpen && (
          <motion.button
            key="close"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={uiActions.toggleDrawer}
            className="glass-surface-strong flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg focus-ring"
            aria-label="Close details"
          >
            <span className="text-xs font-medium text-text-primary">Details</span>
            <X className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <button
        onClick={uiActions.toggleDrawer}
        className={`glass-surface-strong flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg focus-ring ${hasUnreadNotifications ? 'ring-2 ring-warning' : ''}`}
        aria-label="Open details"
      >
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium text-text-primary hidden sm:inline">Details</span>
        {watcherCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-primary text-[#fff] text-[10px] font-bold flex items-center justify-center">
            {watcherCount > 99 ? '99+' : watcherCount}
          </span>
        )}
        {hasUnreadNotifications && (
          <span className="w-2 h-2 rounded-full bg-warning animate-pulse" aria-label="Unread notifications" />
        )}
      </button>
    </div>
  );
}