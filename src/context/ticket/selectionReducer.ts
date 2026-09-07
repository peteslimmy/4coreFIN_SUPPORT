import { initialState, type TicketUIState } from './TicketUIState';

type Action =
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
  | { type: 'RESET_ALL' };

export type SelectionAction = Action;

export function selectionReducer(state: TicketUIState, action: Action): TicketUIState {
  switch (action.type) {
    case 'TOGGLE_DRAWER':
      return { ...state, drawerOpen: !state.drawerOpen };
    case 'SET_DRAWER_OPEN':
      return { ...state, drawerOpen: action.payload };
    case 'SET_DRAWER_TAB':
      return { ...state, drawerTab: action.payload };
    case 'TOGGLE_COMPACT_DENSITY':
      return { ...state, compactDensity: !state.compactDensity };
    case 'SET_COMPACT_DENSITY':
      return { ...state, compactDensity: action.payload };
    case 'SET_SELECTED_TICKETS':
      return { ...state, selectedTicketIds: action.payload };
    case 'SET_SELECTED_WATCHERS':
      return {
        ...state,
        selectedWatcherIds:
          typeof action.payload === 'function'
            ? action.payload(new Set(state.selectedWatcherIds))
            : action.payload,
      };
    case 'TOGGLE_TICKET_SELECTION': {
      const next = new Set(state.selectedTicketIds);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, selectedTicketIds: next };
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedTicketIds: new Set() };
    case 'SET_FOCUSED_INDEX':
      return { ...state, focusedTicketIndex: action.payload };
    case 'SET_MOBILE_TICKET_LIST':
      return { ...state, showMobileTicketList: action.payload };
    case 'SET_LIST_COLLAPSED':
      return { ...state, listCollapsed: action.payload };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}
