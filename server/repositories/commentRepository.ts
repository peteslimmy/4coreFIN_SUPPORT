import { supabase } from '../supabase';
import { type AuthUser } from '../compliance';
import { broadcast } from '../broadcast';
import { tenantScope, toCamel, toSnake, ticketTenantId } from './shared';
import { getScopedTicket } from './ticketRepository';

// ─── Comments ──────────────────────────────────────────────────────────

/** Normalize a comment row's seenBy to always be an array (JSONB may hold a
 * string literal like "[]" from older seeds). */
function normalizeComment(comment: Record<string, any>): Record<string, any> {
  const seenBy = comment.seenBy;
  return { ...comment, seenBy: Array.isArray(seenBy) ? seenBy : [] };
}

export async function listComments(ticketIds?: string[], user?: AuthUser, limit?: number) {
  let query = supabase.from('comments').select('*').order('timestamp', { ascending: false });
  if (ticketIds && ticketIds.length > 0) {
    query = query.in('ticket_id', ticketIds);
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  // Bound the result set for bulk consumers (bootstrap); per-ticket callers
  // pass no limit and rely on the ticket filter.
  if (limit && limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((c) => normalizeComment(toCamel(c)));
}

export async function insertComment(comment: any) {
  const row = toSnake({
    id: comment.id,
    ticketId: comment.ticketId,
    tenantId: comment.tenantId || (await ticketTenantId(comment.ticketId)),
    author: comment.author,
    authorEmail: comment.authorEmail || '',
    role: comment.role,
    message: comment.message,
    timestamp: comment.timestamp,
    isInternal: comment.isInternal || false,
    seen: comment.seen || false,
    parentCommentId: comment.parentCommentId || null,
    seenBy: comment.seenBy || [],
  });
  const { error } = await supabase.from('comments').insert(row);
  if (error) throw new Error(`insertComment failed: ${error.message}`);
  broadcast('comment_added', comment, row.tenant_id);
}

export async function updateComment(comment: any) {
  const row = toSnake({
    message: comment.message,
    timestamp: comment.timestamp,
    seen: comment.seen,
    isInternal: comment.isInternal,
    seenBy: comment.seenBy,
  });
  const { error } = await supabase.from('comments').update(row).eq('id', comment.id);
  if (error) throw new Error(`updateComment failed: ${error.message}`);
}

/** Load a single comment enforcing the user's scope (tenant + ticket access). */
export async function getScopedComment(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('comments').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  const comment = normalizeComment(toCamel(data));
  if (!comment.ticketId) return null;
  const ticket = await getScopedTicket(comment.ticketId, user);
  if (!ticket) return null;
  return comment;
}
