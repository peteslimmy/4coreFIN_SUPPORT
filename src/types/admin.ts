import { TicketPriority } from './app';

export interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  bu: string;
  phone?: string;
}

export interface SlaRule {
  id: string;
  category: string;
  priority: TicketPriority;
  durationHours: number;
}

export interface HolidayRecord {
  id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
}

export interface TicketTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: TicketPriority;
  partner: string;
  amount: string;
  ticketDescription: string;
}

export interface KbArticle {
  id: string;
  title: string;
  category: 'Playbook' | 'Resolution' | 'Known Issue';
  partner: string; // 'Parkway' | 'PayPal' | 'Adyen' | 'Braintree' | 'General'
  content: string;
  tags: string[];
  lastUpdated: string;
}

export interface CategoryRecord {
  name: string;
  description: string;
}
