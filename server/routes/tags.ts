import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';

const TAGS = (name: string) => `tags.${name}` as any;
const KB = (name: string) => `kb.${name}` as any;

const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  color: z.string().max(20).optional().default('#6366f1'),
  parentId: z.string().uuid().nullable().optional(),
});

const ticketTagSchema = z.object({
  ticketId: z.string().min(1),
  tagId: z.string().min(1),
});

export function createTagsRouter(): Router {
  const router = Router();

  // ── Tag Taxonomy ──────────────────────────────────────────

  router.get('/tags', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TAGS('tag_taxonomy'))
        .select('*')
        .eq('active', true)
        .order('name');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.get('/tags/:id', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TAGS('tag_taxonomy'))
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Tag not found' });
      res.json(data);
    }
  );

  router.post('/tags', requireAuth, requireRoles('SUPER_ADMIN', 'BU_SUPPORT'),
    validateBody(createTagSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: crypto.randomUUID(), ...req.body };
      const { error } = await supabase.from(TAGS('tag_taxonomy')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'CONFIG_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Tag ${entry.name} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/tags/:id', requireAuth, requireRoles('SUPER_ADMIN', 'BU_SUPPORT'),
    validateBody(createTagSchema.partial()),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TAGS('tag_taxonomy')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Tag not found' });
      const { error } = await supabase.from(TAGS('tag_taxonomy')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    }
  );

  router.delete('/tags/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TAGS('tag_taxonomy')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Tag not found' });
      const { error } = await supabase.from(TAGS('tag_taxonomy')).update({ active: false }).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    }
  );

  // ── Ticket Tags ───────────────────────────────────────────

  router.get('/tickets/:ticketId/tags', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TAGS('ticket_tags'))
        .select('*')
        .eq('ticket_id', req.params.ticketId);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/tickets/tags', requireAuth, requirePermission('tickets:edit'),
    validateBody(ticketTagSchema),
    async (req: AuthedRequest, res: Response) => {
      const { ticketId, tagId } = req.body;
      const entry = { id: crypto.randomUUID(), ticket_id: ticketId, tag_id: tagId, tagged_by: req.user!.name };
      const { error } = await supabase.from(TAGS('ticket_tags')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json(entry);
    }
  );

  router.delete('/tickets/:ticketId/tags/:tagId', requireAuth, requirePermission('tickets:edit'),
    async (req: AuthedRequest, res: Response) => {
      const { error } = await supabase
        .from(TAGS('ticket_tags'))
        .delete()
        .eq('ticket_id', req.params.ticketId)
        .eq('tag_id', req.params.tagId);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    }
  );

  // ── KB Versions ───────────────────────────────────────────

  router.get('/kb/:articleId/versions', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(KB('kb_article_versions'))
        .select('*')
        .eq('article_id', req.params.articleId)
        .order('version', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/kb/:articleId/versions', requireAuth, requireRoles('SUPER_ADMIN', 'BU_SUPPORT'),
    validateBody(z.object({
      title: z.string().optional().default(''),
      category: z.string().optional().default(''),
      content: z.string().optional().default(''),
      tags: z.array(z.string()).optional().default([]),
      changeNotes: z.string().optional().default(''),
    })),
    async (req: AuthedRequest, res: Response) => {
      const { data: versions } = await supabase
        .from(KB('kb_article_versions'))
        .select('version')
        .eq('article_id', req.params.articleId)
        .order('version', { ascending: false })
        .limit(1);

      const nextVersion = (versions?.[0]?.version || 0) + 1;
      const entry = {
        id: crypto.randomUUID(),
        article_id: req.params.articleId,
        version: nextVersion,
        title: req.body.title || '',
        category: req.body.category || '',
        content: req.body.content || '',
        tags: req.body.tags || [],
        change_notes: req.body.changeNotes || '',
        edited_by: req.user!.name,
      };

      const { error } = await supabase.from(KB('kb_article_versions')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json(entry);
    }
  );

  // ── KB Feedback ───────────────────────────────────────────

  router.get('/kb/:articleId/feedback', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(KB('kb_article_feedback'))
        .select('*')
        .eq('article_id', req.params.articleId)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/kb/:articleId/feedback', requireAuth, requirePermission('knowledge-base:edit'),
    validateBody(z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().optional().default(''),
    })),
    async (req: AuthedRequest, res: Response) => {
      const entry = {
        id: crypto.randomUUID(),
        article_id: req.params.articleId,
        user_id: req.user!.id,
        rating: req.body.rating,
        comment: req.body.comment || '',
      };
      if (entry.rating < 1 || entry.rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
      const { error } = await supabase.from(KB('kb_article_feedback')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json(entry);
    }
  );

  // ── KB View Tracking ──────────────────────────────────────

  router.post('/kb/:articleId/view', requireAuth, requirePermission('knowledge-base:view'),
    async (req: AuthedRequest, res: Response) => {
      const entry = {
        id: crypto.randomUUID(),
        article_id: req.params.articleId,
        user_id: req.user!.id,
      };
      const { error } = await supabase.from(KB('kb_article_views')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json({ ok: true });
    }
  );

  router.get('/kb/:articleId/stats', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data: views } = await supabase
        .from(KB('kb_article_views'))
        .select('id')
        .eq('article_id', req.params.articleId);

      const { data: feedback } = await supabase
        .from(KB('kb_article_feedback'))
        .select('rating')
        .eq('article_id', req.params.articleId);

      const ratings = (feedback ?? []).map((f: any) => f.rating);
      res.json({
        totalViews: (views ?? []).length,
        totalFeedback: ratings.length,
        avgRating: ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null,
      });
    }
  );

  return router;
}
