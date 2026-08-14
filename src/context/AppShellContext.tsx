import { createContext, useContext, useState, useCallback, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { UserRole } from '../types/app';
import { hasPermission } from '../lib/rbac';
import { hasSession } from '../lib/api';
import type { RoleDefinition, Permission } from '../types/rbac';

export interface CurrentUser {
  firstName: string;
  lastName: string;
  email: string;
  bu: string;
  partner: string;
  accountType?: string;
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
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  can: (permission: Permission) => boolean;
}

export const AppShellContext = createContext<AppShellDomain | null>(null);

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppProvider');
  return ctx;
}

export const defaultUser: CurrentUser = { firstName: '', lastName: '', email: '', bu: '', partner: '', accountType: 'BU', phone: '' };

export function useAppShellDomain(roles: RoleDefinition[]): AppShellDomain {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.BU_SUPPORT);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(defaultUser);
const [isLoading, setIsLoading] = useState(() => hasSession());

  const can = useCallback((permission: Permission): boolean => {
    const role = roles.find(r => r.id === currentRole);
    return hasPermission(role, permission);
  }, [roles, currentRole]);

return useMemo(() => ({
    isAuthenticated, setIsAuthenticated,
    mustChangePassword, setMustChangePassword,
    currentRole, setCurrentRole,
    currentUser, setCurrentUser,
    isLoading, setIsLoading,
    can,
  }), [isAuthenticated, mustChangePassword, currentRole, currentUser, isLoading, can]);
}

export function AppShellProvider({ children, value }: { children: ReactNode; value: AppShellDomain }) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}
