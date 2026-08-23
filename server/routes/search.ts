import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { requireAuth, type AuthedRequest } from '../auth';

export function createSearchRouter(): Router {
  const router = Router();

  // GET /api/search?q=term — global search across tickets, customers, KB, documents
  router.get('/search', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const q = (req.query.q as string || '').trim();
      if (q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });

      // Escape Supabase filter wildcards to prevent injection
      const safeQ = q.replace(/[%_,]/g, (c) => `\\${c}`);

      const types = ((req.query.types as string) || 'tickets,customers,kb,documents').split(',');
      const limit = Math.min(50, parseInt(req.query.limit as string) || 10);
      const start = Date.now();
      const results: Record<string, any[]> = {};

      if (types.includes('tickets')) {
        const { data } = await supabase
          .from('tickets' as any)
          .select('id, customer_name, category, status, priority')
          .or(`customer_name.ilike.%${safeQ}%,category.ilike.%${safeQ}%,id.ilike.%${safeQ}%`)
          .limit(limit);
        results.tickets = (data ?? []).map((t: any) => ({
          type: 'ticket',
          id: t.id,
          title: `${t.customer_name} — ${t.category}`,
          subtitle: `${t.status} | ${t.priority}`,
          url: `/tickets/${t.id}`,
        }));
      }

      if (types.includes('customers')) {
        const { data } = await supabase
          .from('customers' as any)
          .select('id, first_name, last_name, email, business_unit')
          .or(`first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%,email.ilike.%${safeQ}%`)
          .limit(limit);
        results.customers = (data ?? []).map((c: any) => ({
          type: 'customer',
          id: c.id,
          title: `${c.first_name} ${c.last_name}`,
          subtitle: `${c.email} | ${c.business_unit}`,
          url: `/customers`,
        }));
      }

      if (types.includes('kb')) {
        const { data } = await supabase
          .from('kb_articles' as any)
          .select('id, title, category, provider')
          .or(`title.ilike.%${safeQ}%,content.ilike.%${safeQ}%,category.ilike.%${safeQ}%`)
          .limit(limit);
        results.kb = (data ?? []).map((a: any) => ({
          type: 'kb_article',
          id: a.id,
          title: a.title,
          subtitle: `${a.category} | ${a.provider}`,
          url: `/knowledge-base`,
        }));
      }

      if (types.includes('documents')) {
        const { data } = await supabase
          .from('documents.document_registry' as any)
          .select('id, title, file_name, file_type, status')
          .ilike('title', `%${safeQ}%`)
          .eq('status', 'active')
          .limit(limit);
        results.documents = (data ?? []).map((d: any) => ({
          type: 'document',
          id: d.id,
          title: d.title,
          subtitle: `${d.file_name} | ${d.file_type}`,
          url: `/documents`,
        }));
      }

      const allResults = Object.values(results).flat();
      const durationMs = Date.now() - start;

      // Log search
      await (supabase.from('search.search_log' as any).insert({
        id: crypto.randomUUID(),
        user_id: req.user!.id,
        query: q,
        entity_types: types,
        result_count: allResults.length,
        duration_ms: durationMs,
      }) as unknown as Promise<unknown>).then(() => {}).catch(() => {});

      res.json({
        query: q,
        results,
        total: allResults.length,
        durationMs,
      });
    }
  );

  // GET /api/search/shortcuts — keyboard shortcuts
  router.get('/search/shortcuts', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from('search.search_shortcuts' as any)
        .select('*')
        .eq('active', true)
        .order('keyword');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  // GET /api/search/recent — recent searches for current user
  router.get('/search/recent', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const limit = Math.min(20, parseInt(req.query.limit as string) || 5);
      const { data, error } = await supabase
        .from('search.search_log' as any)
        .select('query, created_at')
        .eq('user_id', req.user!.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return res.status(500).json({ error: error.message });

      const seen = new Set<string>();
      const unique = (data ?? []).filter((r: any) => {
        if (seen.has(r.query)) return false;
        seen.add(r.query);
        return true;
      });

      res.json(unique);
    }
  );

  return router;
}
