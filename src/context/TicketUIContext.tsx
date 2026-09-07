import React, { createContext, useContext, useReducer, useMemo, type ReactNode } from 'react';
import { type TicketUIState, type TabValue, type TicketUIAction, ticketUIReducer, initialState } from './ticket';

// Re-export types for consumers
export type { TabValue, TicketUIState };

interface TicketUIContextType {
  state: TicketUIState;
  dispatch: React.Dispatch<TicketUIAction>;
  actions: {
    setActiveTicket: (id: string | null) => void;
    setTab: (tab: TabValue) => void;
    toggleChatExpanded: () => void;
    setChatHeight: (height: number) => void;
    toggleDrawer: () => void;
    setDrawerOpen: (open: boolean) => void;
    setDrawerTab: (tab: 'intelligence' | 'watchers' | 'audit') => void;
    toggleCompactDensity: () => void;
    setCompactDensity: (compact: boolean) => void;
    setSelectedTickets: (ids: Set<string>) => void;
    setSelectedWatcherIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    toggleTicketSelection: (id: string) => void;
    clearSelection: () => void;
    setFocusedIndex: (index: number) => void;
    setMobileTicketList: (show: boolean) => void;
    updateRcaForm: (form: Partial<TicketUIState['rcaForm']>) => void;
    resetRcaForm: () => void;
    updateFeedback: (feedback: Partial<TicketUIState['feedbackInput']>) => void;
    setEscalationReason: (reason: string) => void;
    setEscalationModal: (open: boolean) => void;
    setArchiveConfirm: (id: string | null) => void;
    setRemoveWatcherConfirm: (email: string | null) => void;
    setNotifyWatcherModal: (modal: { isOpen: boolean; watcherEmail: string | null }) => void;
    setNewWatcherEmail: (email: string) => void;
    setMergeModal: (open: boolean) => void;
    setNewTicketPanel: (open: boolean) => void;
    updateNewTicketForm: (form: Record<string, unknown>) => void;
    setDirectMessage: (text: string) => void;
    setReplyingTo: (id: string | null) => void;
    setShowMentions: (show: boolean) => void;
    setMentionSearch: (search: string) => void;
    setMentionIndex: (index: number) => void;
    setSendingComment: (sending: boolean) => void;
    setRcaGenerating: (generating: boolean) => void;
    setDeclareResolution: (show: boolean) => void;
    setListCollapsed: (collapsed: boolean) => void;
    resetAll: () => void;
  };
}

const TicketUIContext = createContext<TicketUIContextType | null>(null);

export function useTicketUI() {
  const ctx = useContext(TicketUIContext);
  if (!ctx) throw new Error('useTicketUI must be used within TicketUIProvider');
  return ctx;
}

export function TicketUIProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(ticketUIReducer, initialState);

  const actions = useMemo(() => ({
    setActiveTicket: (id: string | null) => dispatch({ type: 'SET_ACTIVE_TICKET', payload: id }),
    setTab: (tab: TabValue) => dispatch({ type: 'SET_TAB', payload: tab }),
    toggleChatExpanded: () => dispatch({ type: 'TOGGLE_CHAT_EXPANDED' }),
    setChatHeight: (height: number) => dispatch({ type: 'SET_CHAT_HEIGHT', payload: height }),
    toggleDrawer: () => dispatch({ type: 'TOGGLE_DRAWER' }),
    setDrawerOpen: (open: boolean) => dispatch({ type: 'SET_DRAWER_OPEN', payload: open }),
    setDrawerTab: (tab: 'intelligence' | 'watchers' | 'audit') => dispatch({ type: 'SET_DRAWER_TAB', payload: tab }),
    toggleCompactDensity: () => dispatch({ type: 'TOGGLE_COMPACT_DENSITY' }),
    setCompactDensity: (compact: boolean) => dispatch({ type: 'SET_COMPACT_DENSITY', payload: compact }),
    setSelectedTickets: (ids: Set<string>) => dispatch({ type: 'SET_SELECTED_TICKETS', payload: ids }),
    setSelectedWatcherIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => dispatch({ type: 'SET_SELECTED_WATCHERS', payload: ids }),
    toggleTicketSelection: (id: string) => dispatch({ type: 'TOGGLE_TICKET_SELECTION', payload: id }),
    clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),
    setFocusedIndex: (index: number) => dispatch({ type: 'SET_FOCUSED_INDEX', payload: index }),
    setMobileTicketList: (show: boolean) => dispatch({ type: 'SET_MOBILE_TICKET_LIST', payload: show }),
    updateRcaForm: (form: Partial<TicketUIState['rcaForm']>) => dispatch({ type: 'UPDATE_RCA_FORM', payload: form }),
    resetRcaForm: () => dispatch({ type: 'RESET_RCA_FORM' }),
    updateFeedback: (feedback: Partial<TicketUIState['feedbackInput']>) => dispatch({ type: 'UPDATE_FEEDBACK', payload: feedback }),
    setEscalationReason: (reason: string) => dispatch({ type: 'SET_ESCALATION_REASON', payload: reason }),
    setEscalationModal: (open: boolean) => dispatch({ type: 'SET_ESCALATION_MODAL', payload: open }),
    setArchiveConfirm: (id: string | null) => dispatch({ type: 'SET_ARCHIVE_CONFIRM', payload: id }),
    setRemoveWatcherConfirm: (email: string | null) => dispatch({ type: 'SET_REMOVE_WATCHER_CONFIRM', payload: email }),
    setNotifyWatcherModal: (modal: { isOpen: boolean; watcherEmail: string | null }) => dispatch({ type: 'SET_NOTIFY_WATCHER_MODAL', payload: modal }),
    setNewWatcherEmail: (email: string) => dispatch({ type: 'SET_NEW_WATCHER_EMAIL', payload: email }),
    setMergeModal: (open: boolean) => dispatch({ type: 'SET_MERGE_MODAL', payload: open }),
    setNewTicketPanel: (open: boolean) => dispatch({ type: 'SET_NEW_TICKET_PANEL', payload: open }),
    updateNewTicketForm: (form: Record<string, unknown>) => dispatch({ type: 'UPDATE_NEW_TICKET_FORM', payload: form }),
    setDirectMessage: (text: string) => dispatch({ type: 'SET_DIRECT_MESSAGE', payload: text }),
    setReplyingTo: (id: string | null) => dispatch({ type: 'SET_REPLYING_TO', payload: id }),
    setShowMentions: (show: boolean) => dispatch({ type: 'SET_SHOW_MENTIONS', payload: show }),
    setMentionSearch: (search: string) => dispatch({ type: 'SET_MENTION_SEARCH', payload: search }),
    setMentionIndex: (index: number) => dispatch({ type: 'SET_MENTION_INDEX', payload: index }),
    setSendingComment: (sending: boolean) => dispatch({ type: 'SET_SENDING_COMMENT', payload: sending }),
    setRcaGenerating: (generating: boolean) => dispatch({ type: 'SET_RCA_GENERATING', payload: generating }),
    setDeclareResolution: (show: boolean) => dispatch({ type: 'SET_DECLARE_RESOLUTION', payload: show }),
    setListCollapsed: (collapsed: boolean) => dispatch({ type: 'SET_LIST_COLLAPSED', payload: collapsed }),
    resetAll: () => dispatch({ type: 'RESET_ALL' }),
  }), []);

  return (
    <TicketUIContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </TicketUIContext.Provider>
  );
}
