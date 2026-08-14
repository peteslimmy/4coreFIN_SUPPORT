import 'dotenv/config';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Audit DB helper — service-role read/write used by the operational integrity
 * audit harness to verify that "UI says success" actually produced a database
 * change. All writes are for disposable, explicitly-marked test data.
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

function client(): SupabaseClient {
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing');
  return createClient(url, key);
}

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!cached) cached = client();
  return cached;
}

export async function count(table: string, filter?: Record<string, unknown>): Promise<number> {
  let q = db().from(table).select('id', { count: 'exact', head: true });
  if (filter) {
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  }
  const { count: n, error } = await q;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return n ?? 0;
}

export async function rows<T = any>(table: string, filter?: Record<string, unknown>): Promise<T[]> {
  let q = db().from(table).select('*');
  if (filter) {
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  }
  const { data, error } = await q;
  if (error) throw new Error(`rows ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export async function row<T = any>(table: string, filter: Record<string, unknown>): Promise<T | null> {
  const r = await rows<T>(table, filter);
  return r[0] ?? null;
}

export async function ticketById(id: string): Promise<any | null> {
  return row('tickets', { id });
}

export async function usersByRole(): Promise<Record<string, number>> {
  const all = await rows<any>('users');
  const out: Record<string, number> = {};
  for (const u of all) out[u.role] = (out[u.role] ?? 0) + 1;
  return out;
}

export async function listEmails(): Promise<{ email: string; role: string; bu: string; tenant_id: string }[]> {
  return rows('users');
}

/**
 * Provision (or find) a disposable test login account. Creates the Supabase
 * Auth identity + local users row, and clears must_change_password so the user
 * can log straight in. Idempotent by email.
 */
export async function ensureTestUser(opts: { email: string; password: string; name: string; role: string; bu: string; partner?: string }): Promise<string> {
  const existing = await row('users', { email: opts.email }).catch(() => null);
  if (existing) return existing.id;
  const authUser = await db().auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: { name: opts.name },
  });
  if (authUser.error) throw new Error(`createUser(auth) ${opts.email}: ${authUser.error.message}`);
  const userId = 'usr-audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const { error } = await db().from('users').insert({
    id: userId,
    name: opts.name,
    email: opts.email,
    password_hash: 'audit-service-managed',
    role: opts.role,
    bu: opts.bu,
    phone: '',
    tenant_id: `tnt-${opts.bu}`,
    auth_user_id: authUser.data.user.id,
    must_change_password: false,
  });
  if (error) throw new Error(`insert users ${opts.email}: ${error.message}`);
  return userId;
}

export async function main() {
  const mode = process.argv[2] || 'baseline';
  if (mode === 'baseline') {
    const tables = ['users', 'tickets', 'comments', 'evidence', 'audit_logs', 'watcher_notifications', 'major_incidents', 'customers', 'sla_rules', 'holidays', 'ticket_templates', 'kb_articles'];
    console.log('=== DB BASELINE ===');
    for (const t of tables) {
      try {
        const n = await count(t);
        const soft = t === 'tickets' ? await count(t, { is_deleted: true }) : undefined;
        console.log(`${t}: ${n}${soft !== undefined ? ` (${soft} soft-deleted)` : ''}`);
      } catch (e: any) {
        console.log(`${t}: ERROR ${e.message}`);
      }
    }
    const roles = await usersByRole().catch((e: any) => ({ error: e.message }));
    console.log('roles:', JSON.stringify(roles));
    const users = await listEmails().catch((e: any) => []);
    console.log('--- users (email | role | bu | tenant) ---');
    for (const u of users) console.log(`${u.email} | ${u.role} | ${u.bu} | ${u.tenant_id}`);
    const settings = await rows('system_settings').catch((e: any) => []);
    console.log(`--- system_settings keys (${settings.length}) ---`);
    for (const s of settings) console.log(`${s.key} = ${JSON.stringify(s.value)?.slice(0, 160)}`);
  } else if (mode === 'cleanup-test') {
    // Remove ALL audit test artifacts (idempotent sweep).
    const markerLike = 'audit-';
    for (const tb of ['users', 'customers']) {
      const recs = await rows<any>(tb).catch(() => []);
      for (const r of recs) {
        if (String(r.email || '').toLowerCase().includes(markerLike)) {
          const { error } = await db().from(tb).delete().eq('id', r.id);
          if (error) console.log(`del ${tb}/${r.id}: ${error.message}`);
          else console.log(`deleted ${tb}/${r.id} (${r.email})`);
        }
      }
    }
    const tickets = await rows<any>('tickets').catch(() => []);
    for (const t of tickets) {
      const hay = `${t.description || ''} ${t.customer_email || ''} ${t.customer_name || ''}`;
      if (hay.toLowerCase().includes('audit-') || String(t.id).toUpperCase().startsWith('AUD-')) {
        const { error } = await db().from('tickets').delete().eq('id', t.id);
        if (error) console.log(`del ticket/${t.id}: ${error.message}`);
        else console.log(`deleted ticket ${t.id}`);
      }
    }
    for (const tb of ['comments', 'evidence', 'watcher_notifications', 'major_incidents', 'audit_logs']) {
      const { error } = await db().from(tb).delete().like('id', '%audit%');
      if (error && !error.message.includes('audit_logs')) console.log(`cleanup ${tb}: ${error.message}`);
    }
  }
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}