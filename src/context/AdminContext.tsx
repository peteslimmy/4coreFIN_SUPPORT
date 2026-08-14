import { createContext, useContext, useState, useEffect, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react';
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
  businessUnitCodes: Record<string, string>;
  setBusinessUnitCodes: Dispatch<SetStateAction<Record<string, string>>>;
  partners: string[];
  setPartners: Dispatch<SetStateAction<string[]>>;
  paymentChannels: string[];
  setPaymentChannels: Dispatch<SetStateAction<string[]>>;
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
const [users, setUsers] = useState<UserRecord[]>([]);
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
    return [];
  });
  const [partners, setPartners] = useState<string[]>(() => {
    const provRaw = localStorage.getItem('4c_partners') ?? localStorage.getItem('4c_providers');
    if (provRaw !== null) {
      try {
        return JSON.parse(provRaw);
      } catch {
        // fall through to default
      }
    }
    return [];
  });
  const [businessUnitCodes, setBusinessUnitCodes] = useState<Record<string, string>>(() => {
    const raw = localStorage.getItem('4c_business_unit_codes');
    if (raw !== null) {
      try {
        return JSON.parse(raw);
      } catch {
        // fall through to default
      }
    }
    return {};
  });
  const [paymentChannels, setPaymentChannels] = useState<string[]>(() => {
    const raw = localStorage.getItem('4c_payment_channels');
    if (raw !== null) {
      try {
        return JSON.parse(raw);
      } catch {
        // fall through to default
      }
    }
    return ['POS', 'Web', 'Mobile App', 'USSD', 'API'];
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
    return [];
  });

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
    load('4c_users', setUsers);
    load('4c_sla_rules', setSlaRules);
    load('4c_holidays', setHolidays);
    load('4c_ticket_templates', setTicketTemplates);
    load('4c_business_units', setBusinessUnits);
    load('4c_partners', setPartners);
    load('4c_payment_channels', setPaymentChannels);
    load('4c_categories', setCategories);
    load('4c_business_unit_codes', setBusinessUnitCodes);
  }, []);

  const value: AdminDomain = useMemo(() => ({
    users, setUsers,
    slaRules, setSlaRules,
    holidays, setHolidays,
    ticketTemplates, setTicketTemplates,
    businessUnits, setBusinessUnits,
    businessUnitCodes, setBusinessUnitCodes,
    partners, setPartners,
    paymentChannels, setPaymentChannels,
    categories, setCategories,
  }), [users, slaRules, holidays, ticketTemplates, businessUnits, businessUnitCodes, partners, paymentChannels, categories]);

  return value;
}
