import { z } from 'zod';
import { buildId } from '../lib/ids';
import {
  listJsonTable,
  listConfigItems,
  addConfigItem,
  listCustomReferenceKinds,
  countTicketsByBu,
  countTicketsByPartner,
  countTicketsByCategory,
  countActiveTicketsByCategoryAndPriority,
  countUsersByBu,
} from '../repository';
import { normalizeBusinessUnits } from '../../src/lib/buCodes';
import type { Permission } from '../rbac';

export type KindStorage = 'table' | 'config' | 'users';

export interface KindDef {
  storage: KindStorage;
  permission?: Permission;
  label: string;
  /** zod schema applied to the CREATE body (and to the merged UPDATE result). */
  schema: z.ZodType<any>;
  /** identity of an item: string arrays use their value, objects use id/name. */
  idOf: (item: any) => string;
  /** optional stricter role restriction for DELETE (e.g. SUPER_ADMIN only). */
  deleteRoles?: string[];
  /** resolve referential-integrity conflicts. Returns null when safe to delete. */
  checkDelete?: (id: string) => Promise<{ referencedBy: Record<string, number> } | null>;
}

export const KINDS: Record<string, KindDef> = {
  businessUnits: {
    storage: 'config',
    label: 'Business Unit',
    schema: z.object({
      name: z.string().min(1).trim().transform((v) => v.toUpperCase()),
      code: z.string().trim().transform((v) => v.toUpperCase()).optional(),
    }),
    idOf: (i) => String(typeof i === 'string' ? i : (i?.name ?? i?.id ?? '')),
    checkDelete: async (id) => {
      const [tickets, users] = await Promise.all([countTicketsByBu(id), countUsersByBu(id)]);
      const referencedBy: Record<string, number> = {};
      if (tickets > 0) referencedBy.tickets = tickets;
      if (users > 0) referencedBy.users = users;
      return Object.keys(referencedBy).length ? { referencedBy } : null;
    },
  },
  paymentChannels: {
    storage: 'config',
    label: 'Payment Channel',
    schema: z.string().min(1).trim(),
    idOf: (i) => String(i),
  },
  partners: {
    storage: 'config',
    label: 'Payment Partner',
    schema: z.string().min(1).trim(),
    idOf: (i) => String(i),
    checkDelete: async (id) => {
      const tickets = await countTicketsByPartner(id);
      return tickets > 0 ? { referencedBy: { tickets } } : null;
    },
  },
  categories: {
    storage: 'config',
    label: 'Category',
    schema: z.object({ name: z.string().min(1).trim(), description: z.string().optional().default(''), slaHours: z.number().int().positive().optional() }),
    idOf: (i) => String(i.name ?? i.id ?? ''),
    checkDelete: async (id) => {
      const tickets = await countTicketsByCategory(id);
      return tickets > 0 ? { referencedBy: { tickets } } : null;
    },
  },
  notificationConfigs: {
    storage: 'config',
    label: 'Notification Config',
    schema: z.object({
      id: z.string().optional(),
      stage: z.string().min(1).trim(),
      email: z.string().email().trim(),
    }),
    idOf: (i) => String(i.id ?? ''),
  },
  savedReplies: {
    storage: 'config',
    label: 'Saved Reply',
    schema: z.string().min(1).trim(),
    idOf: (i) => String(i),
  },
  escalationRules: {
    storage: 'config',
    label: 'Escalation Rule',
    schema: z.object({
      id: z.string().optional(),
      condition: z.string().min(1).trim(),
      level: z.string().min(1).trim(),
      target: z.string().min(1).trim(),
      action: z.string().min(1).trim(),
    }),
    idOf: (i) => String(i.id ?? ''),
  },
  sla_rules: {
    storage: 'table',
    label: 'SLA Rule',
    schema: z.object({
      id: z.string().optional(),
      category: z.string().min(1).trim(),
      priority: z.string().min(1).trim(),
      durationHours: z.number().int().positive(),
    }),
    idOf: (i) => String(i.id ?? ''),
    deleteRoles: ['SUPER_ADMIN'],
    checkDelete: async (id) => {
      const rules = await listJsonTable('sla_rules');
      const rule = rules.find((r) => String(r.id ?? '') === String(id));
      if (!rule) return null;
      const tickets = await countActiveTicketsByCategoryAndPriority(String(rule.category), String(rule.priority));
      return tickets > 0 ? { referencedBy: { tickets } } : null;
    },
  },
  holidays: {
    storage: 'table',
    label: 'Holiday',
    schema: z.object({
      id: z.string().optional(),
      name: z.string().min(1).trim(),
      date: z.string().min(1).trim(),
      country: z.string().optional().default('NG'),
    }),
    idOf: (i) => String(i.id ?? ''),
  },
  ticket_templates: {
    storage: 'table',
    label: 'Ticket Template',
    schema: z.object({
      id: z.string().optional(),
      name: z.string().min(1).trim(),
      description: z.string().optional().default(''),
      category: z.string().min(1).trim(),
      issueType: z.string().optional(),
      priority: z.string().optional().default('MEDIUM'),
      partner: z.string().optional().default('General'),
      amount: z.union([z.string(), z.number()]).optional().default(''),
      ticketDescription: z.string().optional().default(''),
    }),
    idOf: (i) => String(i.id ?? ''),
  },
  users: {
    storage: 'users',
    permission: 'admin:users',
    deleteRoles: ['SUPER_ADMIN'],
    label: 'User',
    schema: z
      .object({
        id: z.string().optional(),
        name: z.string().min(1).trim(),
        email: z.string().email().trim().toLowerCase(),
        accountType: z.enum(['BU', 'PARTNER']).optional(),
        role: z.enum(['SUPER_ADMIN', 'EXECUTIVE', 'BU_SUPPORT', 'BU_SUPPORT_L1', 'BU_SUPPORT_L2', 'BU_SUPPORT_L3', 'PARTNER']),
        bu: z.string().trim().optional().default(''),
        partner: z.string().trim().optional().default(''),
        phone: z.string().trim().optional().default(''),
        password: z.string().min(6).optional(),
      })
      .superRefine((v, ctx) => {
        const acct = v.accountType ?? (v.role === 'PARTNER' ? 'PARTNER' : 'BU');
        if (acct === 'BU' && !v.bu.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bu'], message: 'Business Unit is required for a BU account' });
        }
        if (acct === 'PARTNER' && !v.partner.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['partner'], message: 'Payment Partner is required for a Payment Partner account' });
        }
        if (acct === 'PARTNER' && v.role !== 'PARTNER') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'Payment Partner accounts must use the PARTNER role' });
        }
        if (acct === 'BU' && v.role === 'PARTNER') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'The PARTNER role requires a Payment Partner account' });
        }
      }),
    idOf: (i) => String(i.id ?? ''),
  },
};

export function nextId(prefix: string): string {
  return buildId(prefix);
}

/** Resolve a kind name, accepting both the snake_case registry key and the
 * camelCase UI label (e.g. slaRules → sla_rules), including user-created
 * custom kinds stored in app_config. */
export async function customKindMap(): Promise<Record<string, KindDef>> {
  const custom = await listCustomReferenceKinds();
  const out: Record<string, KindDef> = {};
  for (const ck of custom) {
    const kind = String(ck?.kind ?? '').trim();
    if (!kind) continue;
    out[kind] = {
      storage: 'config',
      label: ck.label || kind,
      schema: z.string().min(1).trim(),
      idOf: (i) => String(i),
    };
  }
  return out;
}

export async function resolveKind(raw: string): Promise<KindDef | undefined> {
  if (KINDS[raw]) return KINDS[raw];
  const snake = raw.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
  if (KINDS[snake]) return KINDS[snake];
  const custom = await customKindMap();
  return custom[raw] ?? custom[snake];
}

/** Canonical snake_case registry key for a given raw kind label. */
export async function canonicalKind(raw: string): Promise<string> {
  const def = await resolveKind(raw);
  if (!def) return raw;
  const staticKey = Object.keys(KINDS).find((k) => KINDS[k] === def);
  if (staticKey) return staticKey;
  const custom = await customKindMap();
  return Object.keys(custom).find((k) => custom[k] === def) ?? raw;
}

/** Enforce a unique BU code across the stored business unit list. */
export async function assertUniqueBuCode(code: string | undefined, excludeId?: string) {
  if (!code) return;
  const list = await listConfigItems('businessUnits', []);
  for (const item of normalizeBusinessUnits(list)) {
    if (item.name !== excludeId && item.code.toUpperCase() === code.toUpperCase()) {
      throw new Error(`BU code "${code}" is already in use`);
    }
  }
}
