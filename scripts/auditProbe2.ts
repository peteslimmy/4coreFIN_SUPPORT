import 'dotenv/config';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3998';

async function main() {
  const jar = new Map<string, string>();
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'audit.superadmin@4core.test', password: 'Audit#1234x' }),
  });
  for (const c of login.headers.getSetCookie()) {
    const [k, v] = c.split('=');
    const name = k.trim();
    if (name === '4c_session' || name === '4c_csrf') jar.set(name, v.split(';')[0].trim());
  }

  async function call(label: string, path: string, method = 'GET', body?: unknown) {
    const headers: Record<string, string> = {
      Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    };
    if (method !== 'GET') headers['X-CSRF-Token'] = jar.get('4c_csrf') || '';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      const shown = Array.isArray(parsed) ? `array len=${parsed.length} sample=${JSON.stringify(parsed[0] ?? null).slice(0, 200)}` : (parsed === null ? (text || '').slice(0, 160) : JSON.stringify(parsed).slice(0, 300));
      console.log(`[${label}] ${method} ${path} -> ${res.status}  ${shown}`);
      return res.status;
    } catch (e: any) {
      console.log(`[${label}] ${method} ${path} -> TIMEOUT/ERR ${e.name}:${e.message}`);
      return -1;
    } finally {
      clearTimeout(t);
    }
  }

  await call('evidence-2ids', '/api/evidence?ticketId=TKT-2407-004&ticketId=TKT-2407-005');
  await call('customer-by-id', '/api/customers/does-not-exist');
  await call('config-settings', '/api/config/settings');
  await call('major-incidents', '/api/major-incidents');
  await call('notifications', '/api/notifications');
  await call('profile', '/api/profile');
  await call('roles', '/api/rbac/roles');
  await call('sla-rules', '/api/reference/sla_rules');
  await call('form-configs', '/api/form-configs');
  await call('saved-replies', '/api/saved-replies');
  await call('audit-verify', '/api/audit-log/verify');
  await call('public-settings', '/api/public/settings');
  // Prove PARTNER create blocked: try POST /api/tickets as SUPER_ADMIN first (sanity)
  await call('ticket-create-sanity', '/api/tickets', 'POST', {
    businessUnit: 'DIGITAL', category: 'Payment Dispute', issueType: 'Payment Dispute', priority: 'HIGH',
    customerName: 'AUD Test Customer', customerEmail: 'aud-test@example.com', description: 'audit- smoke sanity create', amount: 100,
    transactionId: 'AUD-X1', submittedBy: 'BU_SUPPORT', partner: 'PARKWAY',
  });
}

main().catch((e) => { console.error('ERR', e.message); });