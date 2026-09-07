import { supabase } from '../supabase';

// ─── Generic Table Functions (SLA Rules, Holidays, Templates, KB) ─────

const tableMappers: Record<string, (row: any) => any> = {
  sla_rules: (r) => ({ id: r.id, category: r.category, priority: r.priority, durationHours: r.duration_hours }),
  holidays: (r) => ({ id: r.id, name: r.name, date: r.date, country: r.country }),
  ticket_templates: (r) => ({
    id: r.id, name: r.name, description: r.description, category: r.category,
    issueType: r.issue_type, priority: r.priority, partner: r.partner,
    amount: r.amount, ticketDescription: r.ticket_description,
  }),
  kb_articles: (r) => ({
    id: r.id, title: r.title, category: r.category, partner: r.partner,
    content: r.content, tags: r.tags, lastUpdated: r.last_updated,
  }),
};

const tableInsertMappers: Record<string, (item: any) => any> = {
  sla_rules: (i) => ({ id: i.id, category: i.category, priority: i.priority, duration_hours: i.durationHours || i.duration_hours || 24 }),
  holidays: (i) => ({ id: i.id, name: i.name, date: i.date, country: i.country || 'NG' }),
  ticket_templates: (i) => ({
    id: i.id, name: i.name, description: i.description || '', category: i.category,
    issue_type: i.issueType || i.issue_type, priority: i.priority || 'MEDIUM',
    partner: i.partner || 'General', amount: i.amount || '',
    ticket_description: i.ticketDescription || i.ticket_description || '',
  }),
  kb_articles: (i) => ({
    id: i.id, title: i.title, category: i.category, partner: i.partner || 'General',
    content: i.content || '', tags: i.tags || [], last_updated: i.lastUpdated || i.last_updated || '',
  }),
};

export async function listJsonTable(table: string) {
  const mapper = tableMappers[table];
  if (!mapper) return [];
  const { data, error } = await supabase.from(table as any).select('*');
  if (error || !data) return [];
  return data.map(mapper);
}

export async function replaceJsonTable(table: string, items: any[]) {
  const inserter = tableInsertMappers[table];
  if (!inserter) return;

  const rows = items.map(inserter);

  // Preferred path: the replace_table_rows RPC (migration 045) swaps the
  // whole table in one transaction — a mid-replace failure can never leave
  // the table empty. Falls back to delete+insert when the RPC is unavailable.
  const rpc = (supabase as any).rpc;
  if (typeof rpc === 'function') {
    const { error: rpcError } = await (supabase as any).rpc('replace_table_rows', {
      p_table: table,
      p_rows: rows,
    });
    if (!rpcError) return;
    // RPC missing/failed (e.g. migration not applied) — fall through to the
    // legacy non-atomic path so the operation still completes.
  }

  // Legacy non-atomic path (RPC unavailable): snapshot the current rows first
  // so a failed insert can be rolled back best-effort. Without this, a delete
  // followed by a failed insert would leave the table empty — e.g. wiping all
  // SLA rules and stripping every ticket of its deadline.
  const { data: backup, error: backupError } = await supabase.from(table as any).select('*');
  if (backupError) throw new Error(`replaceJsonTable snapshot failed (${table}): ${backupError.message}`);

  const { error: delError } = await supabase.from(table as any).delete().neq('id', '__none__');
  if (delError) throw new Error(`replaceJsonTable delete failed (${table}): ${delError.message}`);

  if (rows.length > 0) {
    const { error: insError } = await supabase.from(table as any).insert(rows);
    if (insError) {
      // Best-effort restore of the previous contents.
      if (backup && backup.length > 0) {
        await supabase.from(table as any).insert(backup);
      }
      throw new Error(`replaceJsonTable insert failed (${table}): ${insError.message}`);
    }
  }
}

// ─── Reference data: JSON-table (row) manipulation ────────────────────

export async function insertJsonTableRow(table: string, item: any) {
  const inserter = tableInsertMappers[table];
  if (!inserter) throw new Error(`Unknown table: ${table}`);
  const row = inserter(item);
  if (!row.id) throw new Error('Row requires an id');
  const { error } = await supabase.from(table as any).insert(row);
  if (error) throw new Error(`insertJsonTableRow failed (${table}): ${error.message}`);
}

export async function updateJsonTableRow(table: string, id: string, patch: any) {
  const mapper = tableMappers[table];
  const inserter = tableInsertMappers[table];
  if (!mapper || !inserter) throw new Error(`Unknown table: ${table}`);
  // Fetch current clean row, merge patch, reconstruct through the inserter
  // to keep snake_case->camelCase consistency.
  const { data: existing } = await supabase.from(table as any).select('*').eq('id', id).single();
  if (!existing) throw new Error(`Not found: ${id}`);
  const current = mapper(existing);
  const merged = { ...current, ...patch, id };
  const row = inserter(merged);
  const { error } = await supabase.from(table as any).update(row).eq('id', id);
  if (error) throw new Error(`updateJsonTableRow failed (${table}): ${error.message}`);
}

export async function deleteJsonTableRow(table: string, id: string) {
  const { error } = await supabase.from(table as any).delete().eq('id', id);
  if (error) throw new Error(`deleteJsonTableRow failed (${table}): ${error.message}`);
}

// ─── Business Hours ─────────────────────────────────────────────────────

export async function listBusinessHours(tenantId?: string): Promise<any[]> {
  let query = supabase.from('business_hours').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.order('tenant_id').order('day_of_week');
  if (error) throw new Error(`listBusinessHours failed: ${error.message}`);
  return data ?? [];
}

export async function upsertBusinessHours(rows: any[]): Promise<void> {
  if (!rows.length) return;
  // Single bulk upsert — one round-trip instead of N sequential writes.
  const { error } = await supabase.from('business_hours').upsert(rows, { onConflict: 'tenant_id,day_of_week' });
  if (error) throw new Error(`upsertBusinessHours failed: ${error.message}`);
}
