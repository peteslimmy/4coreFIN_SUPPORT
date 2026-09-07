import { type TicketUIState, initialState } from './TicketUIState';
import { selectionReducer } from './selectionReducer';
import { commentReducer } from './commentReducer';
import { modalReducer } from './modalReducer';
import { formReducer } from './formReducer';

export type TicketUIAction =
  | { type: 'SET_ACTIVE_TICKET'; payload: string | null }
  | { type: 'SET_TAB'; payload: TicketUIState['activeTab'] }
  // Selection domain
  | { type: 'TOGGLE_DRAWER' }
  | { type: 'SET_DRAWER_OPEN'; payload: boolean }
  | { type: 'SET_DRAWER_TAB'; payload: TicketUIState['drawerTab'] }
  | { type: 'TOGGLE_COMPACT_DENSITY' }
  | { type: 'SET_COMPACT_DENSITY'; payload: boolean }
  | { type: 'SET_SELECTED_TICKETS'; payload: Set<string> }
  | { type: 'SET_SELECTED_WATCHERS'; payload: Set<string> | ((prev: Set<string>) => Set<string>) }
  | { type: 'TOGGLE_TICKET_SELECTION'; payload: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_FOCUSED_INDEX'; payload: number }
  | { type: 'SET_MOBILE_TICKET_LIST'; payload: boolean }
  | { type: 'SET_LIST_COLLAPSED'; payload: boolean }
  // Comment domain
  | { type: 'TOGGLE_CHAT_EXPANDED' }
  | { type: 'SET_CHAT_HEIGHT'; payload: number }
  | { type: 'SET_DIRECT_MESSAGE'; payload: string }
  | { type: 'SET_REPLYING_TO'; payload: string | null }
  | { type: 'SET_SHOW_MENTIONS'; payload: boolean }
  | { type: 'SET_MENTION_SEARCH'; payload: string }
  | { type: 'SET_MENTION_INDEX'; payload: number }
  | { type: 'SET_SENDING_COMMENT'; payload: boolean }
  // Modal domain
  | { type: 'SET_ESCALATION_REASON'; payload: string }
  | { type: 'SET_ESCALATION_MODAL'; payload: boolean }
  | { type: 'SET_ARCHIVE_CONFIRM'; payload: string | null }
  | { type: 'SET_REMOVE_WATCHER_CONFIRM'; payload: string | null }
  | { type: 'SET_NOTIFY_WATCHER_MODAL'; payload: { isOpen: boolean; watcherEmail: string | null } }
  | { type: 'SET_NEW_WATCHER_EMAIL'; payload: string }
  | { type: 'SET_MERGE_MODAL'; payload: boolean }
  | { type: 'SET_NEW_TICKET_PANEL'; payload: boolean }
  | { type: 'UPDATE_NEW_TICKET_FORM'; payload: Record<string, unknown> }
  // Form domain
  | { type: 'UPDATE_RCA_FORM'; payload: Partial<TicketUIState['rcaForm']> }
  | { type: 'RESET_RCA_FORM' }
  | { type: 'UPDATE_FEEDBACK'; payload: Partial<TicketUIState['feedbackInput']> }
  | { type: 'SET_RCA_GENERATING'; payload: boolean }
  | { type: 'SET_DECLARE_RESOLUTION'; payload: boolean }
  | { type: 'RESET_ALL' };

const rootHandlers = [
  selectionReducer,
  commentReducer,
  modalReducer,
  formReducer,
];

export function ticketUIReducer(state: TicketUIState, action: TicketUIAction): TicketUIState {
  // Root-level actions handled here
  switch (action.type) {
    case 'SET_ACTIVE_TICKET': {
      if (state.activeTicketId === action.payload) return state;
      return {
        ...state,
        activeTicketId: action.payload,
        activeTab: 'overview',
        rcaForm: initialState.rcaForm,
        feedbackInput: initialState.feedbackInput,
        replyingTo: null,
        showMentions: false,
        mentionSearch: '',
        mentionIndex: 0,
        showDeclareResolution: false,
      };
    }
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'RESET_ALL':
      return initialState;
  }

  // Delegate to domain-specific reducers
  for (const reducer of rootHandlers) {
    const next = reducer(state, action as any);
    if (next !== state) return next;
  }

  return state;
}
