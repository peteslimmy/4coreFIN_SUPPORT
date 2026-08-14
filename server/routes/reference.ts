import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  requireAuth,
  hashPassword,
  supabaseCreateUser,
  supabaseUpdateUser,
  supabaseDeleteUser,
  findUserById,
  type AuthedRequest,
} from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import type { Permission } from '../rbac';
import {
  appendAuditLog,
  listJsonTable,
  insertJsonTableRow,
  updateJsonTableRow,
  deleteJsonTableRow,
  listConfigItems,
  addConfigItem,
  updateConfigItem,
  removeConfigItem,
  countTicketsByBu,
  countTicketsByPartner,
  countTicketsByCategory,
  countActiveTicketsByCategoryAndPriority,
  categoryExists,
  countUsersByBu,
  listUsersPublic,
  upsertUser,
  deleteUser,
} from '../repository';
import { normalizeBusinessUnits } from '../../src/lib/buCodes';

type KindStorage = 'table' | 'config' | 'users';

interface KindDef {
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

const KINDS: Record<string, KindDef> = {
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

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Resolve a kind name, accepting both the snake_case registry key and the
 * camelCase UI label (e.g. slaRules → sla_rules). */
function resolveKind(raw: string): KindDef | undefined {
  if (KINDS[raw]) return KINDS[raw];
  const snake = raw.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
  return KINDS[snake];
}

/** Canonical snake_case registry key for a given raw kind label. */
function canonicalKind(raw: string): string {
  const def = resolveKind(raw);
  return def ? Object.keys(KINDS).find((k) => KINDS[k] === def)! : raw;
}

/** Enforce a unique BU code across the stored business unit list. */
async function assertUniqueBuCode(code: string | undefined, excludeId?: string) {
  if (!code) return;
  const list = await listConfigItems('businessUnits', []);
  for (const item of normalizeBusinessUnits(list)) {
    if (item.name !== excludeId && item.code.toUpperCase() === code.toUpperCase()) {
      throw new Error(`BU code "${code}" is already in use`);
    }
  }
}

function audit(actorName: string, actorRole: string, action: string, details: string) {
  return appendAuditLog({ ticketId: null, actor: actorName, role: actorRole, action, details });
}

export function createReferenceRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  function requireKindPermission(req: AuthedRequest, res: Response, next: import('express').NextFunction) {
    req.params.kind = canonicalKind(req.params.kind);
    return requirePermission(KINDS[req.params.kind]?.permission ?? 'admin:config')(req, res, next);
  }

  function requireKindDeleteRole(req: AuthedRequest, res: Response, next: import('express').NextFunction) {
    const roles = KINDS[req.params.kind]?.deleteRoles;
    if (roles && !roles.includes(req.user!.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  }

  // ── List ────────────────────────────────────────────────────────────
  router.get('/:kind', requireKindPermission, async (req: AuthedRequest, res: Response) => {
    const def = KINDS[req.params.kind];
    if (!def) return res.status(404).json({ error: `Unknown reference kind: ${req.params.kind}` });
    const items =
      def.storage === 'table'
        ? await listJsonTable(req.params.kind)
        : def.storage === 'users'
          ? await listUsersPublic()
          : await listConfigItems(req.params.kind, []);
    res.json(req.params.kind === 'businessUnits' ? normalizeBusinessUnits(items) : items);
  });

  // ── Create ──────────────────────────────────────────────────────────
  router.post('/:kind', requireKindPermission, async (req: AuthedRequest, res: Response) => {
    const def = KINDS[req.params.kind];
    if (!def) return res.status(404).json({ error: `Unknown reference kind: ${req.params.kind}` });

    const parsed = def.schema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return res.status(400).json({ error: `${first?.path.join('.') || 'body'}: ${first?.message || 'Invalid input'}` });
    }

    let item = parsed.data;
    try {
      if (def.storage === 'users') {
        if (!item.password) {
          return res.status(400).json({ error: 'password: Required' });
        }
        const userId = item.id || 'usr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        const accountType = item.accountType || (item.role === 'PARTNER' ? 'PARTNER' : 'BU');
        const passwordHash = hashPassword(item.password);
        // Provision a Supabase Auth identity so the user can actually sign in.
        const identity = await supabaseCreateUser(item.email, item.password, item.name);
        const { password: _pw, id: _id, ...rest } = item;
        await upsertUser({ ...rest, accountType, id: userId, passwordHash, authUserId: identity.id, mustChangePassword: true });
        item = { ...rest, accountType, id: userId };
      } else if (def.storage === 'table') {
        if (!def.idOf(item)) item = { ...item, id: nextId(req.params.kind.replace(/_/g, '-')) };
        if (req.params.kind === 'sla_rules' && !(await categoryExists((item as any).category))) {
          return res.status(400).json({ error: 'category: Category must exist in the categories list' });
        }
        await insertJsonTableRow(req.params.kind, item);
      } else {
        if (typeof item !== 'string' && !def.idOf(item)) {
          item = { ...item, id: nextId(req.params.kind.replace(/_/g, '-')) };
        }
        if (req.params.kind === 'businessUnits') {
          await assertUniqueBuCode((item as any)?.code);
        }
        await addConfigItem(req.params.kind, item);
      }
    } catch (e: any) {
      return res.status(409).json({ error: e.message || 'Create failed' });
    }

    await audit(req.user!.name, req.user!.role, `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_CREATED`, `Created ${def.label}: ${def.idOf(item) || item}`);
    res.status(201).json(item);
  });

  // ── Update ──────────────────────────────────────────────────────────
  router.patch('/:kind/:id', requireKindPermission, async (req: AuthedRequest, res: Response) => {
    const def = KINDS[req.params.kind];
    if (!def) return res.status(404).json({ error: `Unknown reference kind: ${req.params.kind}` });

    try {
      if (def.storage === 'users') {
        const items = await listUsersPublic();
        const current = items.find((x) => def.idOf(x) === req.params.id);
        if (!current) return res.status(404).json({ error: `${def.label} not found` });
        const merged = def.schema.safeParse({ ...current, ...req.body, id: req.params.id });
        if (!merged.success) {
          const first = merged.error.issues[0];
          return res.status(400).json({ error: `${first?.path.join('.') || 'body'}: ${first?.message || 'Invalid input'}` });
        }
        const { password, ...rest } = merged.data;
        const existing = await findUserById(req.params.id);
        if (existing?.auth_user_id) {
          await supabaseUpdateUser(existing.auth_user_id, {
            email: merged.data.email,
            password: password || undefined,
            name: merged.data.name,
          });
        }
        await upsertUser({ ...rest, id: req.params.id, passwordHash: password ? hashPassword(password) : undefined });
        await audit(req.user!.name, req.user!.role, `REFERENCE_USERS_UPDATED`, `Updated ${def.label}: ${req.params.id}`);
        return res.json({ ...rest, id: req.params.id });
      }

      if (def.storage === 'table') {
        const existing = await listJsonTable(req.params.kind);
        const current = existing.find((x) => def.idOf(x) === req.params.id);
        if (!current) return res.status(404).json({ error: `${def.label} not found` });
        const merged = def.schema.safeParse({ ...current, ...req.body, id: req.params.id });
        if (!merged.success) {
          const first = merged.error.issues[0];
          return res.status(400).json({ error: `${first?.path.join('.') || 'body'}: ${first?.message || 'Invalid input'}` });
        }
        if (req.params.kind === 'sla_rules' && !(await categoryExists(merged.data.category))) {
          return res.status(400).json({ error: 'category: Category must exist in the categories list' });
        }
        await updateJsonTableRow(req.params.kind, req.params.id, merged.data);
        await audit(req.user!.name, req.user!.role, `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_UPDATED`, `Updated ${def.label}: ${req.params.id}`);
        return res.json(merged.data);
      }

      const items = await listConfigItems(req.params.kind, []);
      const current = items.find((x) => def.idOf(x) === req.params.id);
      if (!current) return res.status(404).json({ error: `${def.label} not found` });

      const merged = def.schema.safeParse(typeof current === 'string' ? req.body : { ...current, ...req.body });
      if (!merged.success) {
        const first = merged.error.issues[0];
        return res.status(400).json({ error: `${first?.path.join('.') || 'body'}: ${first?.message || 'Invalid input'}` });
      }
      if (req.params.kind === 'businessUnits') {
        await assertUniqueBuCode((merged.data as any)?.code, req.params.id);
      }
      await updateConfigItem(req.params.kind, req.params.id, merged.data);
      await audit(req.user!.name, req.user!.role, `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_UPDATED`, `Updated ${def.label}: ${req.params.id}`);
      return res.json(merged.data);
    } catch (e: any) {
      if (/already registered|already been registered/i.test(e?.message || '')) {
        return res.status(409).json({ error: e.message });
      }
      return res.status(500).json({ error: e.message || 'Update failed' });
    }
  });

  // ── Delete ──────────────────────────────────────────────────────────
  router.delete('/:kind/:id', requireKindPermission, requireKindDeleteRole, async (req: AuthedRequest, res: Response) => {
    const def = KINDS[req.params.kind];
    if (!def) return res.status(404).json({ error: `Unknown reference kind: ${req.params.kind}` });

    if (def.checkDelete) {
      const conflict = await def.checkDelete(req.params.id);
      if (conflict) {
        return res.status(409).json({ error: `${def.label} "${req.params.id}" is in use`, referencedBy: conflict.referencedBy });
      }
    }

    try {
      if (def.storage === 'users') {
        const existing = await findUserById(req.params.id);
        if (existing?.auth_user_id) {
          await supabaseDeleteUser(existing.auth_user_id);
        }
        await deleteUser(req.params.id);
      } else if (def.storage === 'table') {
        await deleteJsonTableRow(req.params.kind, req.params.id);
      } else {
        await removeConfigItem(req.params.kind, req.params.id);
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Delete failed' });
    }

    await audit(req.user!.name, req.user!.role, `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_DELETED`, `Deleted ${def.label}: ${req.params.id}`);
    res.json({ ok: true });
  });

  return router;
}
