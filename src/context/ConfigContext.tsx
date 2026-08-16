import { createContext, useContext, useState, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { getRoles } from '../lib/rbac';
import { getDefaultBuFormConfigs } from '../lib/formConfigs';
import type { KbArticle } from '../types/admin';
import type { CustomerRecord } from '../types/app';
import type { BuFormConfig, TicketFormConfig } from '../types/forms';
import type { RoleDefinition } from '../types/rbac';

export interface NotificationConfig {
  id: string;
  stage: string;
  email: string;
}

export interface ConfigDomain {
  kbArticles: KbArticle[];
  setKbArticles: Dispatch<SetStateAction<KbArticle[]>>;
  savedReplies: string[];
  setSavedReplies: Dispatch<SetStateAction<string[]>>;
  customers: CustomerRecord[];
  setCustomers: Dispatch<SetStateAction<CustomerRecord[]>>;
  buFormConfigs: BuFormConfig[];
  setBuFormConfigs: Dispatch<SetStateAction<BuFormConfig[]>>;
  ticketFormConfigs: TicketFormConfig[];
  setTicketFormConfigs: Dispatch<SetStateAction<TicketFormConfig[]>>;
  roles: RoleDefinition[];
  setRoles: Dispatch<SetStateAction<RoleDefinition[]>>;
  notificationConfigs: NotificationConfig[];
  setNotificationConfigs: Dispatch<SetStateAction<NotificationConfig[]>>;
}

export const ConfigContext = createContext<ConfigDomain | null>(null);

export function useConfigContext() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfigContext must be used within ConfigProvider');
  return ctx;
}

export function ConfigProvider({ children, value }: { children: ReactNode; value: ConfigDomain }) {
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfigDomain(): ConfigDomain {
  const [kbArticles, setKbArticles] = useState<KbArticle[]>([]);
  const [savedReplies, setSavedReplies] = useState<string[]>([
    "We have identified a gateway communication timeout on our partner end. Initiating reconciliation check.",
    "The transaction settlement delay has been resolved. Funds should reflect within 24-48 hours.",
    "This charge has been flagged as a duplicate. We are initiating an automated reversal via API."
  ]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  // Form/role defaults until the server bootstrap hydrates the app — the
  // localStorage preloads were removed together with the offline mirrors.
  const [buFormConfigs, setBuFormConfigs] = useState<BuFormConfig[]>(getDefaultBuFormConfigs());
  const [ticketFormConfigs, setTicketFormConfigs] = useState<TicketFormConfig[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>(() => getRoles([]));
  const [notificationConfigs, setNotificationConfigs] = useState<NotificationConfig[]>([
    { id: '1', stage: 'Receipt', email: 'bu-support@company.com' },
    { id: '2', stage: 'Investigation', email: 'parkway-investigations@parkway.com' },
    { id: '3', stage: 'Resolution', email: 'compliance-alerts@company.com' }
  ]);

  const value: ConfigDomain = useMemo(() => ({
    kbArticles, setKbArticles,
    savedReplies, setSavedReplies,
    customers, setCustomers,
    buFormConfigs, setBuFormConfigs,
    ticketFormConfigs, setTicketFormConfigs,
    roles, setRoles,
    notificationConfigs, setNotificationConfigs,
  }), [kbArticles, savedReplies, customers, buFormConfigs, ticketFormConfigs, roles, notificationConfigs]);

  return value;
}
