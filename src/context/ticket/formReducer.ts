import { initialState, type TicketUIState } from './TicketUIState';

type Action =
  | { type: 'UPDATE_RCA_FORM'; payload: Partial<TicketUIState['rcaForm']> }
  | { type: 'RESET_RCA_FORM' }
  | { type: 'UPDATE_FEEDBACK'; payload: Partial<TicketUIState['feedbackInput']> }
  | { type: 'SET_RCA_GENERATING'; payload: boolean }
  | { type: 'SET_DECLARE_RESOLUTION'; payload: boolean }
  | { type: 'RESET_ALL' };

export type FormAction = Action;

export function formReducer(state: TicketUIState, action: Action): TicketUIState {
  switch (action.type) {
    case 'UPDATE_RCA_FORM':
      return { ...state, rcaForm: { ...state.rcaForm, ...action.payload } };
    case 'RESET_RCA_FORM':
      return { ...state, rcaForm: initialState.rcaForm };
    case 'UPDATE_FEEDBACK':
      return { ...state, feedbackInput: { ...state.feedbackInput, ...action.payload } };
    case 'SET_RCA_GENERATING':
      return { ...state, isRcaGenerating: action.payload };
    case 'SET_DECLARE_RESOLUTION':
      return { ...state, showDeclareResolution: action.payload };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}
