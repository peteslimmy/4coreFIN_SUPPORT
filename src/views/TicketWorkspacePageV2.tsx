import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Ticket, List, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import PageTransition from '../components/layout/PageTransition';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { TicketPriority } from '../types/app';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { useTicketUI } from '../context/TicketUIContext';
import { useSwipeGestures } from '../hooks/useSwipeGestures';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTicketActions } from '../hooks/useTicketActions';
import { N_A_BANK } from '../lib/formConfigs';
import TicketListPaneV2 from './ticket-workspace/TicketListPaneV2';
import { HeaderBar } from '../components/ticket/HeaderBar';
import { TabNavigation } from '../components/ticket/TabNavigation';
import { OverviewPanel } from '../components/ticket/OverviewPanel';
import { InvestigationPanel } from '../components/ticket/InvestigationPanel';
import { ChatPanelV2 } from '../components/ticket/ChatPanelV2';
import { KeyboardShortcutOverlay } from '../components/ticket/KeyboardShortcutOverlay';
import { RightDrawer, FABCluster } from '../components/layout/RightDrawer';
import EscalationModals from './ticket-workspace/EscalationModals';
import NewTicketModal, { type NewTicketFormState } from './ticket-workspace/NewTicketModal';
import MergeTicketModal from './ticket-workspace/MergeTicketModal';

interface TicketWorkspacePageV2Props {
  handleDeclareMajorIncident: (formData?: { name: string; description: string; partner: string; category: string; severity: string; initialNotification: string }) => void;
}

export function TicketWorkspacePageV2({ handleDeclareMajorIncident }: TicketWorkspacePageV2Props) {
  const {
    isLoading,
    tickets,
    currentUser,
    logAuditAction,
    handleCreateTicket,
    slaRules,
    holidays,
    can,
  } = useApp();

  const { state: uiState, actions: uiActions } = useTicketUI();
  const { commentText, setCommentText, activeTicketId } = useUi();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [escalationErrors, setEscalationErrors] = useState<Record<string, string>>({});

  const activeTicket = useMemo(() => tickets.find(t => t.id === activeTicketId) || null, [tickets, activeTicketId]);

  const slaConfig = useMemo(() => ({
    slaRules,
    holidays,
    priorityFallbackHours: {
      CRITICAL: 1,
      HIGH: 4,
      MEDIUM: 8,
      LOW: 24,
    },
  }), [slaRules, holidays]);

  const canCreateTicket = can('tickets:create');
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const showMobileTicketList = uiState.showMobileTicketList;

  // Mobile list drawer: auto-close once a ticket is actually selected,
  // instead of leaving the overlay covering the ticket just opened.
  const prevTicketIdRef = useRef<string | null>(activeTicketId ?? null);
  useEffect(() => {
    if (showMobileTicketList && activeTicketId && prevTicketIdRef.current !== activeTicketId) {
      uiActions.setMobileTicketList(false);
    }
    prevTicketIdRef.current = activeTicketId ?? null;
  }, [activeTicketId, showMobileTicketList, uiActions]);

  // Swipe gestures for mobile: right swipe opens ticket list, left swipe closes it
  useSwipeGestures({
    disabled: !isMobile || !showMobileTicketList,
    onSwipeRight: () => {
      if (!showMobileTicketList) uiActions.setMobileTicketList(true);
    },
    onSwipeLeft: () => {
      if (showMobileTicketList) uiActions.setMobileTicketList(false);
    },
    threshold: 80,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && shortcutsOpen) {
        setShortcutsOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcutsOpen]);

  const {
    handleBeginInvestigation,
    handleResolveTicket,
    handleResolutionResponse,
    handleAiGenerateRca,
    handleManualEscalate,
    handleMergeTicket,
    confirmMerge,
    handleSoftDeleteTicket,
    handleWatchToggle,
    handleSendComment,
    handleCommentKeyDown,
  } = useTicketActions({ activeTicket });

  // Client-side gate for the mandatory escalation reason; the server
  // re-validates and enforces the tickets:escalate permission.
  const confirmEscalation = useCallback(async () => {
    const reason = (uiState.escalationReason || '').trim();
    if (reason.length < 10) {
      setEscalationErrors({ escalationReason: 'A reason of at least 10 characters is required.' });
      return;
    }
    setEscalationErrors({});
    await handleManualEscalate();
  }, [uiState.escalationReason, handleManualEscalate]);

  const handleDeclareMajorIncidentWrapper = useCallback(() => {
    if (!activeTicket) return;
    handleDeclareMajorIncident({ name: activeTicket.id, description: activeTicket.description || '', partner: activeTicket.partner || '', category: activeTicket.category || '', severity: activeTicket.priority || '', initialNotification: '' });
  }, [activeTicket, handleDeclareMajorIncident]);

  const handleNewTicketSubmit = useCallback(() => {
    const fullName = `${uiState.newTicketForm.customerFirstName?.trim()} ${uiState.newTicketForm.customerLastName?.trim()}`.trim();
    handleCreateTicket({ ...uiState.newTicketForm, customerName: fullName || 'Unknown Customer' });
    uiActions.setNewTicketPanel(false);
    uiActions.updateNewTicketForm({ customerFirstName: '', customerLastName: '', customerEmail: '', customerPhone: '', customerId: undefined, partner: '', category: '', priority: TicketPriority.HIGH, bankName: N_A_BANK, amount: '', transactionId: '', description: '' });
  }, [uiState.newTicketForm, handleCreateTicket, uiActions]);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex-1 min-w-0 p-6 space-y-4 overflow-hidden">
          <div className="flex items-center gap-4 mb-6">
            <Skeleton variant="text" className="w-48" />
            <Skeleton variant="text" className="w-24" />
            <Skeleton variant="text" className="w-32" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton variant="card" count={3} />
            </div>
            <div className="space-y-4">
              <Skeleton variant="card" count={4} />
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <a href="#ticket-workspace-main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm">
        Skip to ticket content
      </a>
      <KeyboardShortcutOverlay isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <div className="flex-1 flex min-w-0 overflow-hidden relative">
        <div className={`hidden lg:flex shrink-0 border-r border-border transition-all duration-200 ${uiState.listCollapsed ? 'w-10' : 'w-72'}`}>
          {uiState.listCollapsed ? (
            <button
              type="button"
              onClick={() => uiActions.setListCollapsed(false)}
              aria-label="Expand ticket list"
              className="w-full h-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <div className="relative w-full h-full">
              <button
                type="button"
                onClick={() => uiActions.setListCollapsed(true)}
                aria-label="Collapse ticket list"
                className="absolute top-2 right-2 z-10 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
              <TicketListPaneV2
                onNewTicket={canCreateTicket ? () => uiActions.setNewTicketPanel(true) : undefined}
              />
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative" id="ticket-workspace-main">
          {activeTicket ? (
            <div className="flex flex-col flex-1 min-h-0">
              <HeaderBar
                ticket={activeTicket}
                onEscalate={handleManualEscalate}
                onMerge={handleMergeTicket}
                onArchive={handleSoftDeleteTicket}
                onDeclareMajorIncident={handleDeclareMajorIncidentWrapper}
                onWatchToggle={handleWatchToggle}
                isWatching={(activeTicket.watchers || []).includes(currentUser.email)}
              />

              <TabNavigation activeTicket={activeTicket} slaConfig={slaConfig} />

              <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-20">
                <div className="space-y-4 max-w-4xl">
                  {uiState.activeTab === 'overview' && (
                    <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
                      <OverviewPanel ticket={activeTicket} />
                    </div>
                  )}

                  {uiState.activeTab === 'investigation' && (
                    <div role="tabpanel" id="tabpanel-investigation" aria-labelledby="tab-investigation">
                      <InvestigationPanel
                      ticket={activeTicket}
                      slaConfig={slaConfig}
                      onBeginInvestigation={handleBeginInvestigation}
                      onMarkResolved={() => { uiActions.setDeclareResolution(true); logAuditAction(activeTicket.id, 'PARTNER_MARKED_RESOLVED', 'Partner marked investigation as resolved.'); }}
                      onResolveSubmit={handleResolveTicket}
                      onResolutionResponse={handleResolutionResponse}
                      onSaveTemplate={() => {}}
                      onAiGenerateRca={handleAiGenerateRca}
                      showDeclareResolution={uiState.showDeclareResolution}
                      setShowDeclareResolution={uiActions.setDeclareResolution}
                    />
                    </div>
                  )}

                  {uiState.activeTab === 'activity' && (
                    <div role="tabpanel" id="tabpanel-activity" aria-labelledby="tab-activity">
                      <ChatPanelV2
                      activeTicket={activeTicket}
                      commentText={commentText}
                      setCommentText={setCommentText}
                      isSendingComment={uiState.isSendingComment}
                      replyingTo={uiState.replyingTo}
                      setReplyingTo={uiActions.setReplyingTo}
                      showMentions={uiState.showMentions}
                      setShowMentions={uiActions.setShowMentions}
                      mentionSearch={uiState.mentionSearch}
                      setMentionSearch={uiActions.setMentionSearch}
                      mentionIndex={uiState.mentionIndex}
                      setMentionIndex={uiActions.setMentionIndex}
                      onSendComment={handleSendComment}
                      onKeyDown={handleCommentKeyDown}
                      height={uiState.chatHeight || 300}
                      onHeightChange={uiActions.setChatHeight}
                      expanded={uiState.chatExpanded}
                      onToggleExpand={uiActions.toggleChatExpanded}
                    />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center justify-center p-6"
            >
              <EmptyState
                icon={<Ticket className="w-12 h-12" />}
                title="No ticket selected"
                message="Select a ticket from the list to view its details."
              />
            </motion.div>
          )}
        </div>

        <RightDrawer
          activeTicket={activeTicket}
          selectedWatcherIds={uiState.selectedWatcherIds}
          setSelectedWatcherIds={uiActions.setSelectedWatcherIds}
          newWatcherEmail={uiState.newWatcherEmail}
          setNewWatcherEmail={uiActions.setNewWatcherEmail}
          setNotifyWatcherModal={uiActions.setNotifyWatcherModal}
          setRemoveWatcherConfirm={uiActions.setRemoveWatcherConfirm}
          slaConfig={slaConfig}
        />

        <FABCluster activeTicket={activeTicket} />

        <div className="lg:hidden fixed bottom-4 left-4 z-20">
          <button
            type="button"
            onClick={() => uiActions.setMobileTicketList(true)}
            aria-label="Show ticket list"
            className="h-11 w-11 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-dark transition-colors focus-ring"
          >
            <List className="w-5 h-5" />
          </button>
        </div>

        {isMobile && uiState.showMobileTicketList && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <div className="absolute inset-0 bg-overlay" onClick={() => uiActions.setMobileTicketList(false)} />
            <div className="relative h-full w-80 max-w-[85vw] bg-surface-elevated shadow-elevated">
              <TicketListPaneV2
                onNewTicket={canCreateTicket ? () => uiActions.setNewTicketPanel(true) : undefined}
              />
            </div>
          </div>
        )}

        <EscalationModals
          activeTicket={activeTicket}
          showEscalationModal={uiState.showEscalationModal}
          setShowEscalationModal={uiActions.setEscalationModal}
          escalationReason={uiState.escalationReason}
          setEscalationReason={uiActions.setEscalationReason}
          formErrors={escalationErrors}
          clearError={(field) => setEscalationErrors(prev => { const n = { ...prev }; delete n[field]; return n; })}
          clearFormErrors={() => setEscalationErrors({})}
          confirmEscalation={confirmEscalation}
          archiveConfirmId={uiState.archiveConfirmId}
          setArchiveConfirmId={uiActions.setArchiveConfirm}
          removeWatcherConfirm={uiState.removeWatcherConfirm}
          setRemoveWatcherConfirm={uiActions.setRemoveWatcherConfirm}
          notifyWatcherModal={uiState.notifyWatcherModal}
          setNotifyWatcherModal={uiActions.setNotifyWatcherModal}
          directMessageText={uiState.directMessageText}
          setDirectMessageText={uiActions.setDirectMessage}
          selectedWatcherIds={uiState.selectedWatcherIds}
          setSelectedWatcherIds={uiActions.setSelectedWatcherIds}
        />

        <MergeTicketModal
          isOpen={uiState.showMergeModal}
          onClose={() => uiActions.setMergeModal(false)}
          onConfirm={confirmMerge}
          tickets={tickets}
          activeTicketId={activeTicketId}
          activePartner={activeTicket?.partner || ''}
        />

        {canCreateTicket && (
          <NewTicketModal
            isOpen={uiState.showNewTicketPanel}
            onClose={() => uiActions.setNewTicketPanel(false)}
            form={uiState.newTicketForm as NewTicketFormState}
            setForm={uiActions.updateNewTicketForm}
            errors={{}}
            setErrors={() => {}}
            onSubmit={handleNewTicketSubmit}
          />
        )}
      </div>
    </PageTransition>
  );
}

export default React.memo(TicketWorkspacePageV2);