import { supabase } from '../supabase';
import { type AuthUser } from '../compliance';
import { broadcast } from '../broadcast';
import { refreshSignedUrls } from '../services/storageService';
import { tenantScope, toCamel, ticketTenantId } from './shared';

// ─── Evidence ──────────────────────────────────────────────────────────

export async function listEvidence(ticketIds?: string[], user?: AuthUser, limit?: number): Promise<Record<string, any>[]> {
  let query = supabase.from('evidence').select('*').order('uploaded_at', { ascending: false });
  if (ticketIds && ticketIds.length > 0) {
    query = query.in('ticket_id', ticketIds);
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  // Bound the result set for bulk consumers (bootstrap).
  if (limit && limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error || !data) return [];
  const rows = data.map(toCamel);
  // Signed URLs expire; re-sign them so stored links stay downloadable.
  const refreshed = await refreshSignedUrls(rows.map(r => r.url as string | undefined));
  return rows.map((r, i) => ({ ...r, url: refreshed[i] || r.url }));
}

/** Fetch a single evidence row by id, scoped to the user's tenant. */
export async function getEvidenceById(id: string, user?: AuthUser): Promise<Record<string, any> | null> {
  let query = supabase.from('evidence').select('*').eq('id', id);
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const row = toCamel(data);
  const [refreshed] = await refreshSignedUrls([row.url as string | undefined]);
  return { ...row, url: refreshed || row.url };
}

export async function insertEvidence(evidence: {
  id: string;
  ticketId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  uploadedBy: string;
  url: string;
}) {
  const tenantId = await ticketTenantId(evidence.ticketId);
  const { error } = await supabase.from('evidence').insert({
    id: evidence.id,
    ticket_id: evidence.ticketId,
    tenant_id: tenantId,
    file_name: evidence.fileName,
    file_size: evidence.fileSize,
    file_type: evidence.fileType,
    uploaded_at: evidence.uploadedAt,
    uploaded_by: evidence.uploadedBy,
    url: evidence.url,
  });
  if (error) throw new Error(`insertEvidence failed: ${error.message}`);
  broadcast('evidence_added', { ...evidence, ticketId: evidence.ticketId }, tenantId);
}

export async function deleteEvidence(id: string) {
  const { error } = await supabase.from('evidence').delete().eq('id', id);
  if (error) throw new Error(`deleteEvidence failed: ${error.message}`);
  broadcast('evidence_removed', { id });
}
