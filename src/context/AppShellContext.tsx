import { createContext, useContext, useState, useCallback, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { UserRole } from '../types/app';
import { hasPermission } from '../lib/rbac';
import { hasSession } from '../lib/api';
import type { RoleDefinition, Permission } from '../types/rbac';

export interface CurrentUser {
  firstName: string;
  lastName: string;
  email: string;
  bu: string;
  phone: string;
}

export interface AppShellDomain {
  isAuthenticated: boolean;
  setIsAuthenticated: Dispatch<SetStateAction<boolean>>;
  mustChangePassword: boolean;
  setMustChangePassword: Dispatch<SetStateAction<boolean>>;
  currentRole: UserRole;
  setCurrentRole: Dispatch<SetStateAction<UserRole>>;
  currentUser: CurrentUser;
  setCurrentUser: Dispatch<SetStateAction<CurrentUser>>;
  activeTab: string;
  setActiveTab: Dispatch<SetStateAction<string>>;
  activeTicketId: string;
  setActiveTicketId: Dispatch<SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  priorityFilter: string;
  setPriorityFilter: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  commentText: string;
  setCommentText: Dispatch<SetStateAction<string>>;
  can: (permission: Permission) => boolean;
}

export const AppShellContext = createContext<AppShellDomain | null>(null);

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppProvider');
  return ctx;
}

export const defaultUser: CurrentUser = { firstName: '', lastName: '', email: '', bu: '', phone: '' };

export function useAppShellDomain(roles: RoleDefinition[]): AppShellDomain {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.BU_SUPPORT);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(defaultUser);
  const [activeTab, setActiveTab] = useState<string>('tickets');
  const [activeTicketId, setActiveTicketId] = useState<string>('RET-20260717-001');
  const [isLoading, setIsLoading] = useState(() => hasSession());
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [commentText, setCommentText] = useState('');

  const can = useCallback((permission: Permission): boolean => {
    const role = roles.find(r => r.id === currentRole);
    return hasPermission(role, permission);
  }, [roles, currentRole]);

  return {
    isAuthenticated, setIsAuthenticated,
    mustChangePassword, setMustChangePassword,
    currentRole, setCurrentRole,
    currentUser, setCurrentUser,
    activeTab, setActiveTab,
    activeTicketId, setActiveTicketId,
    isLoading, setIsLoading,
    searchQuery, setSearchQuery,
    priorityFilter, setPriorityFilter,
    statusFilter, setStatusFilter,
    commentText, setCommentText,
    can,
  };
}

export function AppShellProvider({ children, value }: { children: ReactNode; value: AppShellDomain }) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}
