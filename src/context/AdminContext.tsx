import { createContext, useContext, useState, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react';
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
  // Empty until the server bootstrap hydrates the app — the localStorage
  // preloads were removed together with the offline mirrors.
  const [businessUnits, setBusinessUnits] = useState<string[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [businessUnitCodes, setBusinessUnitCodes] = useState<Record<string, string>>({});
  const [paymentChannels, setPaymentChannels] = useState<string[]>(['POS', 'Web', 'Mobile App', 'USSD', 'API']);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);

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
