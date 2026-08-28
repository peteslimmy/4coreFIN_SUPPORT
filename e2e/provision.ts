/**
 * E2E provisioning + cleanup.
 *
 * Creates real GoTrue identities (email-confirmed) plus the matching app
 * `users` rows (the same path the app's admin uses), so browser logins work
 * against the configured Supabase project. Cleanup runs best-effort SQL
 * through the Supabase Management API to hard-delete every ticket the run
 * marked `[E2E ...]` plus its child rows, then removes the identities.
 */
import 'dotenv/config';
import https from 'https';
import bcrypt from 'bcryptjs';
import { supabase } from '../server/supabase';
import { tenantIdForBu, GLOBAL_TENANT_ID } from '../server/tenant';
import { ensureTenantForBu } from '../server/repository';
import { E2E_USERS, E2E_PASSWORD, RUN_ID, MARKER, type E2eUser } from './identity';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function managerSqlImpl(query: string): Promise<{ status?: number; data?: unknown; raw?: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => {
          try {
            resolve({ status: r.statusCode, data: JSON.parse(b) });
          } catch {
            resolve({ status: r.statusCode, raw: b });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** Raw call into the project's GoTrue auth API. */
function gotrueRequest(method: string, path: string, body?: unknown): Promise<{ status: number; data?: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const url = new URL(path, SUPABASE_URL);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, data: raw }); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Run SQL against the Supabase project via the Management API. Exposed for
 * spec-level assertions that need cross-cutting truth (e.g. the archive
 * regression asserting MERGE_CLOSE wrote status='CLOSED' + is_deleted).
 */
export async function managerSql(query: string): Promise<{ status?: number; data?: unknown; raw?: string }> {
  return managerSqlImpl(query);
}

async function ensureDeletable() {
  const res = await managerSql(
    `SELECT id FROM tickets WHERE description LIKE '[E2E %]%' ORDER BY id LIMIT 1;`
  );
  return res;
}

/** Purge every GoTrue identity that matches the E2E email pattern (both
 *  the current fixed domain and any stale domains from prior runs). */
async function purgeAllE2EGoTrue(): Promise<void> {
  const { data: list } = await gotrueRequest('GET', '/auth/v1/admin/users');
  const users = (list?.users ?? []) as Array<{ id: string; email?: string }>;
  for (const u of users) {
    if (String(u.email || '').match(/^e2e\.[^@]+@.+\.(e2e|test)$/i)) {
      try { await gotrueRequest('DELETE', `/auth/v1/admin/users/${u.id}`); } catch { /* best-effort */ }
    }
  }
}

async function deleteGoTrueIdentity(email: string): Promise<void> {
  const { data: list } = await gotrueRequest('GET', '/auth/v1/admin/users');
  const user = (list?.users ?? []).find(u => u.email === email);
  if (user) {
    await gotrueRequest('DELETE', `/auth/v1/admin/users/${user.id}`);
  }
}

async function provisionOne(u: E2eUser, password: string): Promise<void> {
  const tenantId = tenantIdForBu(u.bu);
  if (tenantId !== GLOBAL_TENANT_ID && u.bu) {
    await ensureTenantForBu(u.bu).catch(() => {});
  }

  // Upsert GoTrue identity via the admin REST API directly. The Supabase
  // JS client's createUser/updateUserById silently drops the password in
  // this project's configuration, so we call GoTrue's native endpoint.
  const { data: listResult } = await gotrueRequest('GET', '/auth/v1/admin/users');
  const existing = (listResult?.users ?? []).find(
    (x: { email?: string }) => String(x.email || '').toLowerCase() === u.email.toLowerCase()
  );
  let authUserId: string;
  if (existing) {
    const { data: updated } = await gotrueRequest('PUT', `/auth/v1/admin/users/${existing.id}`, {
      password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (!updated?.id) throw new Error(`auth update ${u.email}: no user returned`);
    authUserId = updated.id;
  } else {
    const { data: created } = await gotrueRequest('POST', '/auth/v1/admin/users', {
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (!created?.id) throw new Error(`auth create ${u.email}: no user returned`);
    authUserId = created.id;
  }

  const hash = await bcrypt.hash(password, 10);
  const row: Record<string, unknown> = {
    id: `usr-e2e-${u.key}-${u.email.replace(/[^a-z0-9]/gi, '')}`,
    name: u.name,
    email: u.email,
    password_hash: hash,
    role: u.role,
    bu: u.bu,
    phone: '',
    tenant_id: tenantId,
    account_type: u.role === 'PARTNER' ? 'PARTNER' : 'BU',
    must_change_password: false,
    is_active: true,
    auth_user_id: authUserId,
  };
  if (u.partner) row.partner = u.partner;

  const { error: insertError } = await supabase.from('users').upsert(row);
  if (insertError) throw new Error(`users insert ${u.email}: ${insertError.message}`);
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const META_PATH = path.join(__dirname, '.e2e-meta.json');

/**
 * Write the run's secrets so test workers (separate processes) can consume
 * the same RUN_ID / E2E_PASSWORD / MARKER that provisioning used.
 */
function persistRunMeta(): void {
  try {
    fs.writeFileSync(
      META_PATH,
      JSON.stringify({ runId: RUN_ID, e2ePassword: E2E_PASSWORD, marker: MARKER })
    );
  } catch { /* best-effort */ }
}

/** Provision all E2E users. Idempotent per email within a run. */
export async function provisionTestUsers(): Promise<void> {
  await purgeAllE2EGoTrue();   // wipe stale identities from prior RUN_IDs first
  await ensureDeletable();     // sanity: management API reachable
  for (const u of E2E_USERS) {
    await provisionOne(u, E2E_PASSWORD);
  }

  persistRunMeta();

  // Verify: log what GoTrue returned (raw API — Supabase client listUsers
  // does not consistently reflect the project's actual GoTrue identities).
  const { data: gotrue } = await gotrueRequest('GET', '/auth/v1/admin/users');
  const emails = (gotrue?.users ?? [])
    .filter((u: { email?: string }) => (u.email || '').includes('@') && /\.(e2e|test)$/i.test(u.email || ''))
    .map((u: { id: string; email?: string }) => `${u.email} (${u.id.slice(0, 8)})`);
  console.log('[provision] E2E GoTrue identities:', emails.length > 0 ? emails : 'NONE FOUND');
}

/** Hard-delete E2E tickets (children first), app users, and GoTrue identities. */
export async function cleanupE2eData(): Promise<void> {
  const scope = `SELECT id FROM tickets WHERE description LIKE '[E2E %]%'`;
  const steps = [
    `DELETE FROM watcher_notifications WHERE ticket_id IN (${scope});`,
    `DELETE FROM evidence WHERE ticket_id IN (${scope});`,
    `DELETE FROM comments WHERE ticket_id IN (${scope});`,
    // audit_logs is protected by an immutability trigger (migration 034-era
    // hardening); lift it only for this scoped test-data purge and restore
    // immediately — mirroring what migration 042 does for its backfill.
    `DROP TRIGGER IF EXISTS audit_logs_protect ON audit_logs;`,
    `DELETE FROM audit_logs WHERE ticket_id IN (${scope});`,
    `CREATE TRIGGER audit_logs_protect BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();`,
    `DELETE FROM tickets WHERE description LIKE '[E2E %]%';`,
    `DELETE FROM users WHERE email LIKE 'e2e.%@%.e2e' OR email LIKE 'e2e.%@%.test';`,
  ];
  for (const q of steps) {
    const res = await managerSql(q);
    const data = JSON.stringify(res.data ?? res.raw ?? '');
    if ((res.status ?? 400) >= 400 && !/relation .+ does not exist/i.test(data)) {
       
      console.warn(`[cleanup] statement failed: ${q.slice(0, 80)} -> ${data.slice(0, 200)}`);
    }
  }
  for (const u of E2E_USERS) {
    await deleteGoTrueIdentity(u.email);
  }
}