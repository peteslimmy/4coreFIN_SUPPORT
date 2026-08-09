import { createContext, useContext, useState, useEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { getRoles } from '../lib/rbac';
import { getDefaultBuFormConfigs } from '../lib/formConfigs';
import type { KbArticle } from '../types/admin';
import type { CustomerRecord } from '../types/app';
import type { BuFormConfig } from '../types/forms';
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
    "We have identified a gateway communication timeout on our provider end. Initiating reconciliation check.",
    "The transaction settlement delay has been resolved. Funds should reflect within 24-48 hours.",
    "This charge has been flagged as a duplicate. We are initiating an automated reversal via API."
  ]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [buFormConfigs, setBuFormConfigs] = useState<BuFormConfig[]>(() => {
    const formRaw = localStorage.getItem('4c_bu_form_configs');
    if (formRaw !== null) {
      try {
        return JSON.parse(formRaw);
      } catch {
        // fall through to default
      }
    }
    return getDefaultBuFormConfigs();
  });
  const [roles, setRoles] = useState<RoleDefinition[]>(() => {
    const rolesRaw = localStorage.getItem('4c_roles');
    if (rolesRaw !== null) {
      try {
        return getRoles(JSON.parse(rolesRaw));
      } catch {
        // fall through to default
      }
    }
    return getRoles([]);
  });
  const [notificationConfigs, setNotificationConfigs] = useState<NotificationConfig[]>([
    { id: '1', stage: 'Receipt', email: 'bu-support@company.com' },
    { id: '2', stage: 'Investigation', email: 'parkway-investigations@parkway.com' },
    { id: '3', stage: 'Resolution', email: 'compliance-alerts@company.com' }
  ]);

  // Initialize from localStorage only
  useEffect(() => {
    const load = <T,>(key: string, setter: Dispatch<SetStateAction<T>>) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          setter(JSON.parse(raw));
        } catch {
          // If parsing fails, keep existing state
        }
      }
    };
    load('4c_kb_articles', setKbArticles);
    load('4c_saved_replies', setSavedReplies);
    load('4c_customers', setCustomers);
  }, []);

  const value: ConfigDomain = {
    kbArticles, setKbArticles,
    savedReplies, setSavedReplies,
    customers, setCustomers,
    buFormConfigs, setBuFormConfigs,
    roles, setRoles,
    notificationConfigs, setNotificationConfigs,
  };

  return value;
}
