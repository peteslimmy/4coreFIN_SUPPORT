import { createContext, useContext, useState, useEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import {
  SEED_USERS,
  SEED_SLA_RULES,
  SEED_HOLIDAYS,
  SEED_TEMPLATES,
  SEED_BUSINESS_UNITS,
  SEED_PROVIDERS,
  SEED_CATEGORIES,
} from '../lib/seedData';
import type { UserRecord, SlaRule, HolidayRecord, TicketTemplate, CategoryRecord } from '../types/admin';

export interface AdminDomain {
  users: UserRecord[];
  setUsers: Dispatch<SetStateAction<UserRecord[]>>;
  slaRules: SlaRule[];
  setSlaRules: Dispatch<SetStateAction<SlaRule[]>>;
  holidays: HolidayRecord[];
  setHolidays: Dispatch<SetStateAction<HolidayRecord[]>>;
  ticketTemplates: TicketTemplate[];
  setTicketTemplates: Dispatch<SetStateAction<TicketTemplate[]>>;
  businessUnits: string[];
  setBusinessUnits: Dispatch<SetStateAction<string[]>>;
  providers: string[];
  setProviders: Dispatch<SetStateAction<string[]>>;
  categories: CategoryRecord[];
  setCategories: Dispatch<SetStateAction<CategoryRecord[]>>;
}

export const AdminContext = createContext<AdminDomain | null>(null);

export function useAdminContext() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdminContext must be used within AdminProvider');
  return ctx;
}

export function AdminProvider({ children, value }: { children: ReactNode; value: AdminDomain }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminDomain(): AdminDomain {
  const [users, setUsers] = useState<UserRecord[]>([
    { id: 'usr-1', firstName: 'Sarah', lastName: 'Jenkins', email: 's.jenkins@company.com', role: 'BU_SUPPORT', bu: 'POSSAP', phone: '+1-555-0101' },
    { id: 'usr-2', firstName: 'Marcus', lastName: 'Lee', email: 'm.lee@provider.com', role: 'PROVIDER', bu: 'Parkway', phone: '+1-555-0202' },
    { id: 'usr-3', firstName: 'Elena', lastName: 'Rostova', email: 'e.rostova@exec.com', role: 'EXECUTIVE', bu: 'ALL', phone: '+1-555-0303' },
    { id: 'usr-4', firstName: 'Admin', lastName: 'User', email: 'admin@4core.com', role: 'SUPER_ADMIN', bu: 'ALL', phone: '+1-555-0404' },
    { id: 'usr-5', firstName: 'Chidinma', lastName: 'Okafor', email: 'chidinma@example.com', role: 'PARTNER', bu: 'POSSAP', phone: '+234-801-234-5678' },
  ]);
  const [slaRules, setSlaRules] = useState<SlaRule[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [ticketTemplates, setTicketTemplates] = useState<TicketTemplate[]>([]);
  const [businessUnits, setBusinessUnits] = useState<string[]>(() => {
    const buRaw = localStorage.getItem('4c_business_units');
    if (buRaw !== null) {
      try {
        return JSON.parse(buRaw);
      } catch {
        // fall through to default
      }
    }
    return import.meta.env.DEV ? SEED_BUSINESS_UNITS : ['POSSAP', 'FINANCE-B', 'TRAVEL-C', 'SUBSCRIBE-D'];
  });
  const [providers, setProviders] = useState<string[]>(() => {
    const provRaw = localStorage.getItem('4c_providers');
    if (provRaw !== null) {
      try {
        return JSON.parse(provRaw);
      } catch {
        // fall through to default
      }
    }
    return import.meta.env.DEV ? SEED_PROVIDERS : ['Parkway', 'PayPal', 'Adyen', 'Braintree'];
  });
  const [categories, setCategories] = useState<CategoryRecord[]>(() => {
    const catRaw = localStorage.getItem('4c_categories');
    if (catRaw !== null) {
      try {
        return JSON.parse(catRaw);
      } catch {
        // fall through to default
      }
    }
    return import.meta.env.DEV ? SEED_CATEGORIES : [
      { name: 'Bank Code Issues', description: 'Issues related to incorrect or missing bank codes' },
      { name: 'Notification Issue', description: 'Failed or delayed payment notifications' },
      { name: 'Disbursement Discrepancy', description: 'Disbursed amount does not match expected value' },
      { name: 'Failed Disbursement', description: 'Disbursement transaction failed entirely' },
      { name: 'Transaction Reference Discrepancies', description: 'Transaction reference mismatches between systems' },
      { name: 'Settlement', description: 'Settlement processing issues' },
      { name: 'Configuration Issues', description: 'System or integration configuration problems' },
      { name: 'Reconciliation and Settlement', description: 'Reconciliation mismatches across ledgers' },
      { name: 'System Performance', description: 'System latency, downtime, or capacity issues' },
      { name: 'Payment Gateway Integration', description: 'Integration issues with payment gateways' },
      { name: 'Fund Management', description: 'Fund allocation, float, and liquidity issues' },
      { name: 'Failed Payment', description: 'End-user payment failure at checkout' },
      { name: 'Operational Performance', description: 'Operational workflow and processing delays' },
      { name: 'Invoice Generation and Account Validation Issue', description: 'Invoice generation failures or account validation errors' },
      { name: 'Delay in Receiving Notification', description: 'Notifications not received within SLA' }
    ];
  });

  // Initialize from localStorage or seed data
  useEffect(() => {
    const load = <T,>(key: string, fallback: T, setter: Dispatch<SetStateAction<T>>) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        let parsed: T;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = fallback;
        }
        const isEmpty = Array.isArray(parsed) && parsed.length === 0;
        const hasSeed = Array.isArray(fallback) && fallback.length > 0;
        if (isEmpty && hasSeed && import.meta.env.DEV) {
          setter(fallback);
          localStorage.setItem(key, JSON.stringify(fallback));
        } else {
          setter(parsed);
        }
      } else if (import.meta.env.DEV) {
        setter(fallback);
        localStorage.setItem(key, JSON.stringify(fallback));
      }
    };
    load('4c_users', SEED_USERS, setUsers);
    load('4c_sla_rules', SEED_SLA_RULES, setSlaRules);
    load('4c_holidays', SEED_HOLIDAYS, setHolidays);
    load('4c_ticket_templates', SEED_TEMPLATES, setTicketTemplates);
  }, []);

  const value: AdminDomain = {
    users, setUsers,
    slaRules, setSlaRules,
    holidays, setHolidays,
    ticketTemplates, setTicketTemplates,
    businessUnits, setBusinessUnits,
    providers, setProviders,
    categories, setCategories,
  };

  return value;
}
