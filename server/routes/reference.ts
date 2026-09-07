import { Router, type Response } from 'express';
import {
  requireAuth,
  hashPasswordAsync,
  supabaseCreateUser,
  supabaseUpdateUser,
  supabaseDeleteUser,
  findUserById,
  type AuthedRequest,
} from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { buildToken } from '../lib/ids';
import { sendUserInvite } from '../services/emailService';
import {
  listJsonTable,
  insertJsonTableRow,
  updateJsonTableRow,
  deleteJsonTableRow,
  listConfigItems,
  addConfigItem,
  updateConfigItem,
  removeConfigItem,
  listUsersPublic,
  upsertUser,
  deleteUser,
  categoryExists,
} from '../repository';
import { audit, AuditAction } from '../auditEvents';
import {
  KINDS,
  resolveKind,
  canonicalKind,
  nextId,
  assertUniqueBuCode,
} from './referenceKinds';

export function createReferenceRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  async function requireKindPermissionRead(req: AuthedRequest, res: Response, next: import('express').NextFunction) {
    try {
      req.params.kind = await canonicalKind(req.params.kind);
      const def = await resolveKind(req.params.kind);
      return requirePermission(def?.permission ?? 'admin:config:read')(req, res, next);
    } catch (e) {
      next(e);
    }
  }

  async function requireKindPermissionWrite(req: AuthedRequest, res: Response, next: import('express').NextFunction) {
    try {
      req.params.kind = await canonicalKind(req.params.kind);
      const def = await resolveKind(req.params.kind);
      return requirePermission(def?.permission ?? 'admin:config:write')(req, res, next);
    } catch (e) {
      next(e);
    }
  }

  async function requireKindDeleteRole(req: AuthedRequest, res: Response, next: import('express').NextFunction) {
    try {
      const roles = (await resolveKind(req.params.kind))?.deleteRoles;
      if (roles && !roles.includes(req.user!.role)) {
        return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
      }
      next();
    } catch (e) {
      next(e);
    }
  }

  // ── Custom kinds ───────────────────────────────────────────────────
  router.get('/kinds', requirePermission('admin:config:read'), async (_req: AuthedRequest, res: Response) => {
    const { listCustomReferenceKinds } = await import('../repository');
    res.json(await listCustomReferenceKinds());
  });

  router.post('/kinds', requirePermission('admin:config:write'), async (req: AuthedRequest, res: Response) => {
    const { addCustomReferenceKind, addConfigItem } = await import('../repository');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const kind = String(body.kind ?? body.name ?? '').trim();
    const label = String(body.label ?? '').trim();
    if (!kind) return res.status(400).json({ error: 'kind: Required' });
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(kind)) {
      return res.status(400).json({ error: 'kind: Use letters, numbers and underscores (no spaces, e.g. payment_providers)' });
    }
    if (KINDS[kind]) return res.status(409).json({ error: `"${kind}" is a built-in reference kind` });
    if (!label) return res.status(400).json({ error: 'label: Required' });

    const def = {
      kind,
      label,
      labelPlural: String(body.labelPlural ?? label).trim(),
      description: String(body.description ?? '').trim(),
      stringItems: true as const,
    };

    try {
      await addCustomReferenceKind(def);
    } catch (e: any) {
      return res.status(409).json({ error: e.message || 'Create failed' });
    }

    const items = Array.isArray(body.items)
      ? (body.items as unknown[]).map((i) => String(i ?? '').trim()).filter(Boolean)
      : [];
    for (const item of items) {
      try {
        await addConfigItem(kind, item);
      } catch {
        // Item already present — keep going.
      }
    }

    await audit({ event: 'REFERENCE_KIND_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.REFERENCE_KIND_CREATED, details: `Created reference kind "${label}" (${kind}) with ${items.length} item(s).` });
    res.status(201).json({ ...def, items });
  });

  // ── List ────────────────────────────────────────────────────────────
  router.get('/:kind', requireKindPermissionRead, async (req: AuthedRequest, res: Response) => {
    const def = await resolveKind(req.params.kind);
    if (!def) return res.status(404).json({ error: `Unknown reference kind: ${req.params.kind}` });
    const items =
      def.storage === 'table'
        ? await listJsonTable(req.params.kind)
        : def.storage === 'users'
          ? await listUsersPublic()
          : await listConfigItems(req.params.kind, []);
    const { normalizeBusinessUnits } = await import('../../src/lib/buCodes');
    res.json(req.params.kind === 'businessUnits' ? normalizeBusinessUnits(items) : items);
  });

  // ── Create ──────────────────────────────────────────────────────────
  router.post('/:kind', requireKindPermissionWrite, async (req: AuthedRequest, res: Response) => {
    const def = await resolveKind(req.params.kind);
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
        const userId = item.id || nextId('usr');
        const accountType = item.accountType || (item.role === 'PARTNER' ? 'PARTNER' : 'BU');
        const passwordHash = await hashPasswordAsync(item.password);
        const activationToken = buildToken(32);
        // Provision a Supabase Auth identity so the user can actually sign in.
        const identity = await supabaseCreateUser(item.email, item.password, item.name);
        const { password: _pw, id: _id, ...rest } = item;
        await upsertUser({ ...rest, accountType, id: userId, passwordHash, authUserId: identity.id, mustChangePassword: true, isActive: false, activationToken, activatedAt: null });
        // Best-effort welcome email with the temporary credentials. A failure
        // (e.g. SMTP not configured) is surfaced in the response but does not
        // roll back the account — the admin can resend the invitation later.
        const invite = await sendUserInvite({
          to: item.email,
          name: item.name,
          email: item.email,
          loginUrl: `${req.protocol}://${req.get('host')}/auth/login`,
          tempPassword: item.password,
          sentBy: req.user?.name,
        });
        await audit({ event: invite.ok ? 'USER_INVITED' : 'USER_INVITE_FAILED', actor: req.user!.name, role: req.user!.role, action: invite.ok ? AuditAction.USER_INVITED : 'USER_INVITE_FAILED' as AuditAction, details: `Created ${def.label}: ${userId} — welcome email ${invite.ok ? 'sent' : `failed (${invite.error || 'unknown'})`}` });
        item = { ...rest, accountType, id: userId, activationPending: true, invitationSent: invite.ok };
      } else if (def.storage === 'table') {
        if (!def.idOf(item)) item = { ...item, id: nextId(req.params.kind.replace(/_/g, '-')) };
        if (req.params.kind === 'sla_rules' && !(await categoryExists((item as any).category))) {
          return res.status(400).json({ error: 'category: Category must exist in the categories list' });
        }
        if (req.params.kind === 'sla_rules') {
          const existing = await listJsonTable('sla_rules').then((rules) =>
            rules.find(
              (r) =>
                String(r.category) === String((item as any).category) &&
                String(r.priority) === String((item as any).priority)
            )
          );
          if (existing) {
            return res.status(409).json({ error: `SLA rule "${existing.category} / ${existing.priority}" already exists` });
          }
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

    await audit({ event: `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_CREATED`, actor: req.user!.name, role: req.user!.role, action: (`REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_CREATED`) as AuditAction, details: `Created ${def.label}: ${def.idOf(item) || item}` });
    res.status(201).json(item);
  });

  // ── Update ──────────────────────────────────────────────────────────
  router.patch('/:kind/:id', requireKindPermissionWrite, async (req: AuthedRequest, res: Response) => {
    const def = await resolveKind(req.params.kind);
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
        await upsertUser({ ...rest, id: req.params.id, passwordHash: password ? await hashPasswordAsync(password) : undefined });
        await audit({ event: `REFERENCE_USERS_UPDATED`, actor: req.user!.name, role: req.user!.role, action: ('REFERENCE_USERS_UPDATED') as AuditAction, details: `Updated ${def.label}: ${req.params.id}` });
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
        await audit({ event: `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_UPDATED`, actor: req.user!.name, role: req.user!.role, action: (`REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_UPDATED`) as AuditAction, details: `Updated ${def.label}: ${req.params.id}` });
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
      await audit({ event: `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_UPDATED`, actor: req.user!.name, role: req.user!.role, action: (`REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_UPDATED`) as AuditAction, details: `Updated ${def.label}: ${req.params.id}` });
      return res.json(merged.data);
    } catch (e: any) {
      if (/already registered|already been registered/i.test(e?.message || '')) {
        return res.status(409).json({ error: e.message });
      }
      return res.status(500).json({ error: e.message || 'Update failed' });
    }
  });

  // ── Delete ──────────────────────────────────────────────────────────
  router.delete('/:kind/:id', requireKindPermissionWrite, requireKindDeleteRole, async (req: AuthedRequest, res: Response) => {
    const def = await resolveKind(req.params.kind);
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

    await audit({ event: `REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_DELETED`, actor: req.user!.name, role: req.user!.role, action: (`REFERENCE_${req.params.kind.replace(/_/g, '_').toUpperCase()}_DELETED`) as AuditAction, details: `Deleted ${def.label}: ${req.params.id}` });
    res.json({ ok: true });
  });

  return router;
}
