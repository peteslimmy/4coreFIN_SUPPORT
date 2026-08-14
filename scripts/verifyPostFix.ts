import 'dotenv/config';

const BASE = 'http://localhost:3001';
const EMAIL = process.env.E2E_EMAIL || 'peteslimmy@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD || process.env.DEMO_PASSWORD || 'password123';

let cookies = '';
let csrf = '';

function parseCookies(setCookie: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const out: Record<string, string> = {};
  for (const c of arr) {
    const kv = c.split(';')[0];
    const idx = kv.indexOf('=');
    if (idx > 0) out[kv.slice(0, idx).trim()] = kv.slice(idx + 1);
  }
  return out;
}

async function req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (cookies) headers['Cookie'] = cookies;
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data: unknown = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

function summarize(label: string, r: { status: number; data: unknown }) {
  const s = typeof r.data === 'object' && r.data ? JSON.stringify(r.data).slice(0, 180) : String(r.data ?? '');
  console.log(`${label}: status=${r.status} :: ${s}`);
}

async function main() {
  console.log(`login ${EMAIL}`);
  const login = await req('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  const ck = parseCookies(login.headers.getSetCookie?.() ?? login.headers.get('set-cookie') ?? undefined);
  cookies = `4c_session=${ck['4c_session']}; 4c_csrf=${ck['4c_csrf']}`;
  csrf = ck['4c_csrf'] || '';
  summarize('login', login);
  if (login.status !== 200 || !csrf) { console.error('LOGIN FAILED'); process.exit(1); }

  summarize('me', await req('GET', '/api/auth/me'));

  // ── previously hung: GET /users (silent []) ──
  const users = await req('GET', '/api/users');
  summarize('GET /users', users);
  const userCount = Array.isArray(users.data) ? users.data.length : -1;

  // ── previously hung: POST /users (orphan auth risk) ──
  const newUser = {
    name: 'Smoke BU User', email: `smoke.bu.${Date.now()}@4core.test`, role: 'BU_SUPPORT', bu: 'POSSAP',
    phone: '', password: 'Smoke#1234x',
  };
  const created = await req('POST', '/api/users', newUser);
  summarize('POST /users', created);
  if (created.status === 201) {
    const uid = (created.data as any)?.id;
    const del = await req('DELETE', `/api/users/${uid}`);
    summarize('DELETE /users (cleanup)', del);
  }

  // ── previously hung: POST /api/tickets ──
  const tBody = {
    title: 'Smoke post-fix ticket', description: 'Verifying ticket creation no longer hangs',
    priority: 'MEDIUM', category: 'General Enquiry', businessUnit: 'POSSAP', submittedBy: 'BU_SUPPORT',
  };
  const t1 = await req('POST', '/api/tickets', tBody);
  summarize('POST /tickets', t1);
  const tid = (t1.data as any)?.id;
  if (tid) {
    const p = await req('PATCH', `/api/tickets/${tid}`, { priority: 'HIGH' });
    summarize('PATCH /tickets/:id', p);
    const ev = await req('GET', `/api/evidence?ticketId=${tid}&ticketId=tk-nonexistent`);
    summarize('GET /evidence multi-ticketId', ev);
  }

  // ── previously 404 dead code ──
  summarize('GET /config/settings', await req('GET', '/api/config/settings'));

  // ── customers detail ──
  const custs = await req('GET', '/api/customers');
  summarize('GET /customers', custs);
  const cid = Array.isArray(custs.data) && custs.data.length ? (custs.data[0] as any).id : 'cst-nope';
  summarize('GET /customers/:id', await req('GET', `/api/customers/${cid}`));

  // ── comment id echo ──
  if (tid) {
    const cmId = `cm-smoke-${Date.now()}`;
    const c = await req('POST', '/api/comments', { id: cmId, ticketId: tid, message: 'smoke comment', isInternal: false });
    summarize('POST /comments (client id)', c);
    const echoedId = (c.data as any)?.id;
    console.log(`comment id echo match: ${echoedId === cmId}`);
    const list = await req('GET', `/api/tickets/${tid}/comments`);
    summarize('GET ticket comments', list);
  }

  console.log(`\nusers before: ${userCount}`);
}

main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });