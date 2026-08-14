import { createContext, useContext, useState, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react';

export interface UiDomain {
  commentText: string;
  setCommentText: Dispatch<SetStateAction<string>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  priorityFilter: string;
  setPriorityFilter: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  activeTab: string;
  setActiveTab: Dispatch<SetStateAction<string>>;
  activeTicketId: string;
  setActiveTicketId: Dispatch<SetStateAction<string>>;
}

const UiContext = createContext<UiDomain | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [commentText, setCommentText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<string>('tickets');
  const [activeTicketId, setActiveTicketId] = useState<string>('RET-20260717-001');

  const value = useMemo(() => ({
    commentText, setCommentText,
    searchQuery, setSearchQuery,
    priorityFilter, setPriorityFilter,
    statusFilter, setStatusFilter,
    activeTab, setActiveTab,
    activeTicketId, setActiveTicketId,
  }), [commentText, searchQuery, priorityFilter, statusFilter, activeTab, activeTicketId]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}