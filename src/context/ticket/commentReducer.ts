import { initialState, type TicketUIState } from './TicketUIState';

type Action =
  | { type: 'TOGGLE_CHAT_EXPANDED' }
  | { type: 'SET_CHAT_HEIGHT'; payload: number }
  | { type: 'SET_DIRECT_MESSAGE'; payload: string }
  | { type: 'SET_REPLYING_TO'; payload: string | null }
  | { type: 'SET_SHOW_MENTIONS'; payload: boolean }
  | { type: 'SET_MENTION_SEARCH'; payload: string }
  | { type: 'SET_MENTION_INDEX'; payload: number }
  | { type: 'SET_SENDING_COMMENT'; payload: boolean }
  | { type: 'RESET_ALL' };

export type CommentAction = Action;

export function commentReducer(state: TicketUIState, action: Action): TicketUIState {
  switch (action.type) {
    case 'TOGGLE_CHAT_EXPANDED':
      return { ...state, chatExpanded: !state.chatExpanded };
    case 'SET_CHAT_HEIGHT':
      return { ...state, chatHeight: action.payload };
    case 'SET_DIRECT_MESSAGE':
      return { ...state, directMessageText: action.payload };
    case 'SET_REPLYING_TO':
      return { ...state, replyingTo: action.payload };
    case 'SET_SHOW_MENTIONS':
      return { ...state, showMentions: action.payload };
    case 'SET_MENTION_SEARCH':
      return { ...state, mentionSearch: action.payload };
    case 'SET_MENTION_INDEX':
      return { ...state, mentionIndex: action.payload };
    case 'SET_SENDING_COMMENT':
      return { ...state, isSendingComment: action.payload };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}
