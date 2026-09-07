import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';
import { escapeLike } from '../lib/escapeLike';

const TBL = (name: string) => `documents.${name}` as any;

const createDocSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(1000).optional().default(''),
  folderId: z.string().uuid().nullable().optional(),
  fileName: z.string().min(1),
  fileSize: z.number().int().min(0),
  fileType: z.string().optional().default(''),
  mimeType: z.string().optional().default('application/octet-stream'),
  storagePath: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

const createFolderSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(500).optional().default(''),
});

const versionSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().min(0),
  fileType: z.string().optional().default(''),
  storagePath: z.string().optional().default(''),
  changeNotes: z.string().max(500).optional().default(''),
});

/** Admin roles that can access all documents regardless of BU. */
const GLOBAL_ROLES = new Set(['SUPER_ADMIN', 'EXECUTIVE']);

/**
 * Check whether the requesting user is authorized to access a document.
 * Authorization passes if the user is a global admin, or if the document was
 * uploaded by the user, or if the document's BU matches the user's BU.
 */
function canAccessDocument(doc: any, user: { role: string; bu?: string; name: string }): boolean {
  if (GLOBAL_ROLES.has(user.role)) return true;
  if (doc.uploaded_by === user.name) return true;
  if (doc.business_unit && doc.business_unit === user.bu) return true;
  return false;
}

export function createDocumentRouter(): Router {
  const router = Router();

  // ── Folders ───────────────────────────────────────────────

  router.get('/documents/folders', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('document_folders'))
        .select('*')
        .order('name');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/documents/folders', requireAuth, requirePermission('documents:create'),
    validateBody(createFolderSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: crypto.randomUUID(), ...req.body, created_by: req.user!.name };
      const { error } = await supabase.from(TBL('document_folders')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'CONFIG_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Document folder ${entry.name} created` });
      res.status(201).json(entry);
    }
  );

  // ── Documents ─────────────────────────────────────────────

  router.get('/documents', requireAuth, requirePermission('documents:view'),
    async (req: AuthedRequest, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 25);
      const offset = (page - 1) * limit;

      let query = supabase.from(TBL('document_registry')).select('*', { count: 'exact' })
        .eq('status', 'active');

      // BU-scoped filtering: PARTNER and BU roles only see their own BU's documents
      if (!GLOBAL_ROLES.has(req.user!.role) && req.user!.bu && req.user!.bu !== 'ALL') {
        query = query.eq('business_unit', req.user!.bu);
      }

      const folderId = req.query.folderId as string;
      if (folderId) query = query.eq('folder_id', folderId);

      const search = req.query.search as string;
      if (search) query = query.ilike('title', `%${escapeLike(search)}%`);

      const tag = req.query.tag as string;
      if (tag) query = query.contains('tags', JSON.stringify([tag]));

      const { data, count, error } = await query
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return res.status(500).json({ error: error.message });
      res.json({ items: data ?? [], total: count ?? 0, page, limit });
    }
  );

  router.get('/documents/:id', requireAuth, requirePermission('documents:view'),
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('document_registry'))
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Document not found' });
      if (!canAccessDocument(data, req.user!)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json(data);
    }
  );

  router.post('/documents', requireAuth, requirePermission('documents:create'),
    validateBody(createDocSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = {
        id: crypto.randomUUID(),
        ...req.body,
        version: 1,
        status: 'active',
        uploaded_by: req.user!.name,
        business_unit: req.user!.bu || '',
      };
      const { error } = await supabase.from(TBL('document_registry')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });

      const { error: verErr } = await supabase.from(TBL('document_versions')).insert({
        id: crypto.randomUUID(),
        document_id: entry.id,
        version: 1,
        file_name: entry.fileName,
        file_size: entry.fileSize,
        file_type: entry.fileType,
        storage_path: entry.storagePath,
        change_notes: 'Initial upload',
        uploaded_by: req.user!.name,
      });
      if (verErr) console.error('Failed to create initial version:', verErr.message);

      await audit({ event: 'EVIDENCE_UPLOADED', actor: req.user!.name, role: req.user!.role, action: AuditAction.EVIDENCE_UPLOADED, details: `Document ${entry.title} uploaded` });
      res.status(201).json(entry);
    }
  );

  router.patch('/documents/:id', requireAuth, requirePermission('documents:edit'),
    validateBody(createDocSchema.partial()),
    async (req: AuthedRequest, res: Response) => {
      const { data: doc } = await supabase.from(TBL('document_registry')).select('*').eq('id', req.params.id).single();
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (!canAccessDocument(doc, req.user!)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      const { error } = await supabase.from(TBL('document_registry')).update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    }
  );

  router.delete('/documents/:id', requireAuth, requirePermission('documents:delete'),
    async (req: AuthedRequest, res: Response) => {
      const { data: doc } = await supabase.from(TBL('document_registry')).select('*').eq('id', req.params.id).single();
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (!canAccessDocument(doc, req.user!)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      const { error } = await supabase.from(TBL('document_registry')).update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    }
  );

  // ── Versions ──────────────────────────────────────────────

  router.get('/documents/:id/versions', requireAuth, requirePermission('documents:view'),
    async (req: AuthedRequest, res: Response) => {
      const { data: doc } = await supabase
        .from(TBL('document_registry'))
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (!canAccessDocument(doc, req.user!)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      const { data, error } = await supabase
        .from(TBL('document_versions'))
        .select('*')
        .eq('document_id', req.params.id)
        .order('version', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/documents/:id/versions', requireAuth, requirePermission('documents:edit'),
    validateBody(versionSchema),
    async (req: AuthedRequest, res: Response) => {
      const { data: doc } = await supabase
        .from(TBL('document_registry'))
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (!canAccessDocument(doc, req.user!)) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const newVersion = doc.version + 1;
      const entry = {
        id: crypto.randomUUID(),
        document_id: req.params.id,
        version: newVersion,
        ...req.body,
        uploaded_by: req.user!.name,
      };

      const { error } = await supabase.from(TBL('document_versions')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });

      await supabase.from(TBL('document_registry')).update({
        version: newVersion,
        file_name: req.body.fileName,
        file_size: req.body.fileSize,
        file_type: req.body.fileType,
        storage_path: req.body.storagePath,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id);

      res.status(201).json(entry);
    }
  );

  // ── Stats ─────────────────────────────────────────────────

  router.get('/documents/stats/summary', requireAuth, requirePermission('documents:view'),
    async (req: AuthedRequest, res: Response) => {
      let query = supabase
        .from(TBL('document_registry'))
        .select('id, file_size, status, folder_id')
        .eq('status', 'active');

      if (!GLOBAL_ROLES.has(req.user!.role) && req.user!.bu && req.user!.bu !== 'ALL') {
        query = query.eq('business_unit', req.user!.bu);
      }

      const { data: docs, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      const items = docs ?? [];
      res.json({
        totalDocuments: items.length,
        totalSizeBytes: items.reduce((sum: number, d: any) => sum + (d.file_size || 0), 0),
        folderBreakdown: items.reduce((acc: Record<string, number>, d: any) => {
          const fid = d.folder_id || 'root';
          acc[fid] = (acc[fid] || 0) + 1;
          return acc;
        }, {}),
      });
    }
  );

  return router;
}
