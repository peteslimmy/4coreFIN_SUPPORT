import 'dotenv/config';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3998';

async function main() {
  const jar = new Map<string, string>();
  const setCookies = (h: Headers) => {
    const sc = h.getSetCookie ? h.getSetCookie() : [];
    for (const c of sc) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      jar.set(k.trim(), v.trim());
    }
  };

  function auth(cs: boolean) {
    const headers: Record<string, string> = {};
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers['Cookie'] = cookie;
    if (cs && jar.has('4c_csrf')) headers['X-CSRF-Token'] = jar.get('4c_csrf')!;
    return headers;
  }

  async function call(label: string, method: string, path: string, body?: unknown, opts: { csrf?: boolean; json?: boolean } = {}) {
    const headers: Record<string, string> = { ...auth(opts.csrf ?? true) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    setCookies(res.headers);
    let text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* non-json */ }
    console.log(`\n[${label}] ${method} ${path} -> ${res.status}`);
    if (parsed === null) console.log((text || '').slice(0, 200));
    else if (Array.isArray(parsed)) console.log(`  array len=${parsed.length} sample=${JSON.stringify(parsed[0] ?? null).slice(0, 260)}`);
    else console.log(`  ${JSON.stringify(parsed).slice(0, 400)}`);
    return { status: res.status, data: parsed };
  }

  const email = process.env.AUDIT_EMAIL || process.env.E2E_EMAIL || 'peteslimmy@gmail.com';
  const password = process.env.AUDIT_PASSWORD || process.env.E2E_PASSWORD || process.env.DEMO_PASSWORD || 'password123';

  await call('login', 'POST', '/api/auth/login', { email, password }, { csrf: false });
  await call('me', 'GET', '/api/auth/me');
  await call('bootstrap', 'GET', '/api/bootstrap');
  await call('tickets', 'GET', '/api/tickets');
  await call('comments-unknown', 'GET', '/api/tickets/TKT-2407-004/comments');
  await call('audit-log', 'GET', '/api/audit-log?limit=5');
  await call('users', 'GET', '/api/users');
  await call('config-businessUnits', 'GET', '/api/config/businessUnits');
  await call('config-partners', 'GET', '/api/config/partners');
  await call('reference-partners', 'GET', '/api/reference/partners');
  await call('customers', 'GET', '/api/customers');
  await call('evidence-all', 'GET', '/api/evidence');
  await call('evidence-2ids', 'GET', '/api/evidence?ticketId=TKT-2407-004&ticketId=TKT-2407-005');
  await call('customer-by-id', 'GET', '/api/customers/nope');
  await call('config-settings', 'GET', '/api/config/settings');
  await call('major-incidents', 'GET', '/api/major-incidents');
  await call('notifications', 'GET', '/api/notifications');
  await call('profile', 'GET', '/api/profile');
  await call('roles', 'GET', '/api/rbac/roles');
  await call('sla-rules', 'GET', '/api/reference/sla_rules');
  await call('form-configs', 'GET', '/api/form-configs');
  await call('saved-replies', 'GET', '/api/saved-replies');
}

main().catch((e) => { console.error('SMOKE ERROR', e); process.exit(1); });