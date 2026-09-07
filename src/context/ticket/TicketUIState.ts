export type TabValue = 'overview' | 'investigation' | 'activity';

export interface TicketUIState {
  activeTicketId: string | null;
  activeTab: TabValue;
  chatExpanded: boolean;
  chatHeight: number;
  drawerOpen: boolean;
  drawerTab: 'intelligence' | 'watchers' | 'audit';
  compactDensity: boolean;
  selectedTicketIds: Set<string>;
  selectedWatcherIds: Set<string>;
  focusedTicketIndex: number;
  showMobileTicketList: boolean;
  rcaForm: {
    rootCause: string;
    contributingFactors: string;
    correctiveActions: string;
    preventiveActions: string;
  };
  feedbackInput: {
    score: number;
    comment: string;
  };
  escalationReason: string;
  showEscalationModal: boolean;
  archiveConfirmId: string | null;
  removeWatcherConfirm: string | null;
  notifyWatcherModal: { isOpen: boolean; watcherEmail: string | null };
  newWatcherEmail: string;
  showMergeModal: boolean;
  showNewTicketPanel: boolean;
  newTicketForm: Record<string, unknown>;
  directMessageText: string;
  replyingTo: string | null;
  showMentions: boolean;
  mentionSearch: string;
  mentionIndex: number;
  isSendingComment: boolean;
  isRcaGenerating: boolean;
  showDeclareResolution: boolean;
  listCollapsed: boolean;
}

export const initialState: TicketUIState = {
  activeTicketId: null,
  activeTab: 'overview',
  chatExpanded: false,
  chatHeight: 0,
  drawerOpen: false,
  drawerTab: 'intelligence',
  compactDensity: false,
  selectedTicketIds: new Set(),
  selectedWatcherIds: new Set(),
  focusedTicketIndex: -1,
  showMobileTicketList: false,
  rcaForm: { rootCause: '', contributingFactors: '', correctiveActions: '', preventiveActions: '' },
  feedbackInput: { score: 5, comment: '' },
  escalationReason: '',
  showEscalationModal: false,
  archiveConfirmId: null,
  removeWatcherConfirm: null,
  notifyWatcherModal: { isOpen: false, watcherEmail: null },
  newWatcherEmail: '',
  showMergeModal: false,
  showNewTicketPanel: false,
  newTicketForm: {},
  directMessageText: '',
  replyingTo: null,
  showMentions: false,
  mentionSearch: '',
  mentionIndex: 0,
  isSendingComment: false,
  isRcaGenerating: false,
  showDeclareResolution: false,
  listCollapsed: false,
};
