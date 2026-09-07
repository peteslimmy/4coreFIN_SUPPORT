import { initialState, type TicketUIState } from './TicketUIState';

type Action =
  | { type: 'SET_ESCALATION_REASON'; payload: string }
  | { type: 'SET_ESCALATION_MODAL'; payload: boolean }
  | { type: 'SET_ARCHIVE_CONFIRM'; payload: string | null }
  | { type: 'SET_REMOVE_WATCHER_CONFIRM'; payload: string | null }
  | { type: 'SET_NOTIFY_WATCHER_MODAL'; payload: { isOpen: boolean; watcherEmail: string | null } }
  | { type: 'SET_NEW_WATCHER_EMAIL'; payload: string }
  | { type: 'SET_MERGE_MODAL'; payload: boolean }
  | { type: 'SET_NEW_TICKET_PANEL'; payload: boolean }
  | { type: 'UPDATE_NEW_TICKET_FORM'; payload: Record<string, unknown> }
  | { type: 'RESET_ALL' };

export type ModalAction = Action;

export function modalReducer(state: TicketUIState, action: Action): TicketUIState {
  switch (action.type) {
    case 'SET_ESCALATION_REASON':
      return { ...state, escalationReason: action.payload };
    case 'SET_ESCALATION_MODAL':
      return { ...state, showEscalationModal: action.payload };
    case 'SET_ARCHIVE_CONFIRM':
      return { ...state, archiveConfirmId: action.payload };
    case 'SET_REMOVE_WATCHER_CONFIRM':
      return { ...state, removeWatcherConfirm: action.payload };
    case 'SET_NOTIFY_WATCHER_MODAL':
      return { ...state, notifyWatcherModal: action.payload };
    case 'SET_NEW_WATCHER_EMAIL':
      return { ...state, newWatcherEmail: action.payload };
    case 'SET_MERGE_MODAL':
      return { ...state, showMergeModal: action.payload };
    case 'SET_NEW_TICKET_PANEL':
      return { ...state, showNewTicketPanel: action.payload };
    case 'UPDATE_NEW_TICKET_FORM':
      return { ...state, newTicketForm: { ...state.newTicketForm, ...action.payload } };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}
