import type { ReactNode } from 'react';
import type { CategoryRecord, HolidayRecord, KbArticle, SlaRule, TicketTemplate } from './admin';

export interface EscalationRule {
  id: string;
  condition: string;
  level: string;
  target: string;
  action: string;
}

/**
 * Schema that drives the generic reference-data CRUD UI. Each managed kind
 * (businessUnits, partners, categories, …) is described here so the UI can
 * render a table + form without bespoke per-kind components.
 */
export interface ReferenceFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'textarea' | 'select' | 'password';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  /** Only for number fields: a positive-integer spinner. */
  min?: number;
  /** Display-only on the row table. */
  render?: (item: Record<string, unknown>) => ReactNode;
}

export interface ReferenceKindDef {
  kind: string;
  label: string;
  labelPlural: string;
  /** True when each row is a bare string (businessUnits, partners, savedReplies). */
  stringItems: boolean;
  description: string;
  fields: ReferenceFieldDef[];
  columns: { key: string; header: string; render?: (item: Record<string, unknown>) => ReactNode }[];
  /** Identity of a row — for string items the value itself. */
  idOf: (item: unknown) => string;
  /** Permission required to view/manage this kind. Defaults to admin:config. */
  permission?: string;
  /** Roles allowed to delete rows. Defaults to anyone who can view. */
  deleteRoles?: string[];
}

export const ESCALATION_RULES_SEED: EscalationRule[] = [
  { id: 'esc-1', condition: 'SLA deadline breached', level: 'Level 1 - BU Support', target: 'BU Support Team', action: 'Flag CRITICAL and notify ticket watchers' },
  { id: 'esc-2', condition: 'Manual escalation by BU Support', level: 'Level 2 - Super Admin', target: 'Super Admin', action: 'Escalate to CRITICAL priority with audit record' },
  { id: 'esc-3', condition: 'No partner response within 6 hours', level: 'Level 3 - Executive', target: 'Executive Office', action: 'Trigger Major Incident review' },
];

function text(key: string, label: string, opts: Partial<ReferenceFieldDef> = {}): ReferenceFieldDef {
  return { key, label, type: 'text', ...opts };
}

function str(id: string): string {
  return id;
}

/** Read a field off an unknown row without `any` casts. */
function field(item: unknown, ...keys: string[]): unknown {
  if (typeof item !== 'object' || item === null) return undefined;
  const row = item as Record<string, unknown>;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined) return v;
  }
  return undefined;
}

export const REFERENCE_KINDS: ReferenceKindDef[] = [
  {
    kind: 'businessUnits',
    label: 'Business Unit',
    labelPlural: 'Business Units',
    stringItems: false,
    description: 'Business units that file and receive complaints, each with a unique code used for ticket numbering. Deleting one in active use is blocked.',
    fields: [
      text('name', 'Business Unit Name', { required: true, placeholder: 'e.g. POSSAP' }),
      text('code', 'BU Code (e.g. POSA)', { required: true, placeholder: 'Unique code used in ticket IDs' }),
    ],
    columns: [
      { key: 'name', header: 'Business Unit' },
      { key: 'code', header: 'BU Code' },
    ],
    idOf: (i) => String(field(i, 'name', 'id') ?? ''),
  },
  {
    kind: 'paymentChannels',
    label: 'Payment Channel',
    labelPlural: 'Payment Channels',
    stringItems: true,
    description: 'Channels available when filing a ticket (e.g. POS, Web, Mobile App, USSD, API). Fed into complaint forms.',
    fields: [text('value', 'Channel Name', { required: true, placeholder: 'e.g. POS' })],
    columns: [{ key: 'value', header: 'Channel' }],
    idOf: str,
  },
  {
    kind: 'partners',
    label: 'Payment Partner',
    labelPlural: 'Payment Partners',
    stringItems: true,
    description: 'Payment partners handling ticket investigations. Deleting one with open tickets is blocked.',
    fields: [text('value', 'Payment Partner Name', { required: true, placeholder: 'e.g. Paystack' })],
    columns: [{ key: 'value', header: 'Payment Partner' }],
    idOf: str,
  },
  {
    kind: 'categories',
    label: 'Category',
    labelPlural: 'Categories',
    stringItems: false,
    description: 'Complaint categories used across ticket classification. Optionally set a default SLA (hours). Deleting a category in use is blocked.',
    fields: [
      text('name', 'Category Name', { required: true, placeholder: 'e.g. Payment Dispute' }),
      text('description', 'Description', { placeholder: 'Short description' }),
      { key: 'slaHours', label: 'Default SLA (hours)', type: 'number', min: 1, placeholder: 'e.g. 24' },
    ],
    columns: [
      { key: 'name', header: 'Category' },
      { key: 'description', header: 'Description' },
      { key: 'slaHours', header: 'SLA (h)', render: (i) => (i.slaHours ? String(i.slaHours) : '—') },
    ],
    idOf: (i) => String(field(i, 'name', 'id') ?? ''),
  },
  {
    kind: 'slaRules',
    label: 'SLA Rule',
    labelPlural: 'SLA Rules',
    stringItems: false,
    description: 'Resolution time targets per category and priority.',
    fields: [
      text('category', 'Category', { required: true }),
      { key: 'priority', label: 'Priority', type: 'select', required: true, options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      { key: 'durationHours', label: 'Duration (hours)', type: 'number', required: true, min: 1 },
    ],
    columns: [
      { key: 'category', header: 'Category' },
      { key: 'priority', header: 'Priority' },
      { key: 'durationHours', header: 'Hours' },
    ],
    idOf: (i) => String(field(i, 'id') ?? ''),
  },
  {
    kind: 'holidays',
    label: 'Holiday',
    labelPlural: 'Holidays',
    stringItems: false,
    description: 'Public holidays excluded from SLA working-time calculations.',
    fields: [
      text('name', 'Holiday Name', { required: true }),
      text('date', 'Date (YYYY-MM-DD)', { required: true, placeholder: '2026-10-01' }),
      text('country', 'Country', { placeholder: 'NG' }),
    ],
    columns: [
      { key: 'name', header: 'Holiday' },
      { key: 'date', header: 'Date' },
      { key: 'country', header: 'Country' },
    ],
    idOf: (i) => String(field(i, 'id') ?? ''),
  },
  {
    kind: 'ticketTemplates',
    label: 'Ticket Template',
    labelPlural: 'Ticket Templates',
    stringItems: false,
    description: 'Reusable complaint templates to speed up new-ticket creation.',
    fields: [
      text('name', 'Template Name', { required: true }),
      text('category', 'Category', { required: true }),
      { key: 'priority', label: 'Priority', type: 'select', required: true, options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      text('partner', 'Partner'),
      text('amount', 'Amount'),
      text('ticketDescription', 'Description', { type: 'textarea' }),
    ],
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'category', header: 'Category' },
      { key: 'priority', header: 'Priority' },
      { key: 'partner', header: 'Partner' },
    ],
    idOf: (i) => String(field(i, 'id') ?? ''),
  },
  {
    kind: 'escalationRules',
    label: 'Escalation Rule',
    labelPlural: 'Escalation Rules',
    stringItems: false,
    description: 'Escalation matrix governing how breaches move up the chain.',
    fields: [
      text('condition', 'Condition', { required: true }),
      text('level', 'Level', { required: true }),
      text('target', 'Target', { required: true }),
      text('action', 'Action', { type: 'textarea', required: true }),
    ],
    columns: [
      { key: 'condition', header: 'Condition' },
      { key: 'level', header: 'Level' },
      { key: 'target', header: 'Target' },
      { key: 'action', header: 'Action' },
    ],
    idOf: (i) => String(field(i, 'id') ?? ''),
  },
  {
    kind: 'notificationConfigs',
    label: 'Notification Config',
    labelPlural: 'Notification Configs',
    stringItems: false,
    description: 'Email recipients alerted at each SLA stage.',
    fields: [
      text('stage', 'Stage', { required: true }),
      { key: 'email', label: 'Email', type: 'email', required: true },
    ],
    columns: [
      { key: 'stage', header: 'Stage' },
      { key: 'email', header: 'Email' },
    ],
    idOf: (i) => String(field(i, 'id') ?? ''),
  },
  {
    kind: 'savedReplies',
    label: 'Saved Reply',
    labelPlural: 'Saved Replies',
    stringItems: true,
    description: 'Quick-reply templates agents can paste into ticket comments.',
    fields: [text('value', 'Reply Text', { type: 'textarea', required: true })],
    columns: [{ key: 'value', header: 'Reply' }],
    idOf: str,
  },
  {
    kind: 'users',
    label: 'User',
    labelPlural: 'Users',
    stringItems: false,
    permission: 'admin:users',
    deleteRoles: ['SUPER_ADMIN'],
    description: 'Staff accounts that sign into the platform. Deleting a user requires the SUPER_ADMIN role.',
    fields: [
      text('firstName', 'First Name', { required: true }),
      text('lastName', 'Last Name', { required: true }),
      { key: 'email', label: 'Email', type: 'email', required: true },
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        required: true,
        options: ['SUPER_ADMIN', 'BU_SUPPORT', 'EXECUTIVE', 'PARTNER', 'CUSTOMER'],
      },
      text('bu', 'Business Unit', { required: true, placeholder: 'e.g. POSSAP' }),
      text('phone', 'Phone'),
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Set a new password (min 6 chars)' },
    ],
    columns: [
      { key: 'firstName', header: 'Name', render: (i) => String(i.firstName ?? '') + (i.lastName ? ' ' + String(i.lastName) : '') },
      { key: 'email', header: 'Email' },
      { key: 'role', header: 'Role' },
      { key: 'bu', header: 'Business Unit' },
      { key: 'phone', header: 'Phone' },
    ],
    idOf: (i) => String(field(i, 'id') ?? ''),
  },
];

export function referenceKind(kind: string): ReferenceKindDef | undefined {
  return REFERENCE_KINDS.find((k) => k.kind === kind);
}

export type { CategoryRecord, HolidayRecord, KbArticle, SlaRule, TicketTemplate };
