import http from 'node:http';
import https from 'node:https';
import fsp from 'node:fs/promises';
import fs from 'node:fs';

// ── Read .env ──
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
}

const BASE = 'http://localhost:3001';
const SUPABASE_URL = env.SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_KEY;
const QA_EMAIL = 'qa_test_20260815_201550@4coreqa.local';
const QA_PASS  = 'QA_Test_Pass_2026!';

const jar = new Map();
const RESULTS = [];
let csrfToken;

function setCookies(raw) {
  if (!raw) return;
  for (const line of (Array.isArray(raw) ? raw : [raw])) {
    const name = line.split(';')[0].split('=')[0].trim();
    const value = line.split(';')[0].split('=')[1].trim();
    if (name) jar.set(name, value);
  }
}
function cookiesHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = {
      'Content-Type': 'application/json',
      'Cookie': cookiesHeader(),
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      ...extraHeaders,
    };
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        setCookies(res.headers['set-cookie']);
        let parsed;
        try { parsed = JSON.parse(Buffer.concat(chunks).toString()); } catch { parsed = Buffer.concat(chunks).toString(); }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function post(path, body, headers = {})   { return request('POST',    path, JSON.stringify(body), headers); }
function patch(path, body, headers = {})  { return request('PATCH',   path, JSON.stringify(body), headers); }
function get(path, headers = {})          { return request('GET',     path, null, headers); }

function csrf(headers = {}) { return { 'X-CSRF-Token': csrfToken, ...headers }; }
function rec(id, actual, status, severity = 'MEDIUM') {
  RESULTS.push({ id, status, severity, actual: JSON.stringify(actual).slice(0, 500) });
  console.log(`[${status}] ${id}: ${JSON.stringify(actual).slice(0, 220)}`);
}

async function login(email, password) {
  const r = await post('/api/auth/login', { email, password });
  csrfToken = jar.get('4c_csrf');
  return r;
}

async function run() {
  console.log('=== QA CRITICAL TESTS ===\n');

  // Login as SUPER_ADMIN QA user
  console.log('--- Login QA SUPER_ADMIN ---');
  let r = await login(QA_EMAIL, QA_PASS);
  if (r.status !== 200) { console.error('LOGIN FAILED', r); process.exit(1); }
  console.log('QA login OK, CSRF:', !!csrfToken);

  // ── SEC-04: CSRF missing token ──
  console.log('\n--- SEC-04: CSRF missing token ---');
  r = await patch('/api/tickets/QA_SEC04', { to: 'RESOLVED' });
  rec('SEC-04', { status: r.status, body: r.body }, r.status === 403 ? 'PASS' : 'FAIL', 'HIGH');

  // ── Create PARTNER via /api/users ──
  console.log('\n--- SEC-PARTNER-CREATE ---');
  const partnerEmail = `qa_partner2_${Date.now()}@4coreqa.local`;
  const partnerPass  = 'QA_Pass_2026!';
  r = await post('/api/users', {
    name: 'QA Partner', email: partnerEmail, role: 'PARTNER',
    partner: 'QA_PARTNER', password: partnerPass,
  }, csrf());
  const partnerId = r.body?.id;
  rec('SEC-PARTNER-CREATE', { status: r.status, id: partnerId }, r.status === 201 ? 'PASS' : 'FAIL');

  // Fix partner: set isActive=true, mustChangePassword=false via direct Supabase
  if (partnerId && r.status === 201) {
    const fixR = await request('PATCH',
      `${SUPABASE_URL}/rest/v1/users?id=eq.${partnerId}`,
      JSON.stringify({ is_active: true, must_change_password: false }),
      { 'apikey': SVC, 'Authorization': `Bearer ${SVC}`, 'Prefer': 'return=minimal', 'Content-Type': 'application/json' }
    );
    console.log('  Fix partner active:', fixR.status);
    // Also unban in GoTrue
    const goTrueId = r.body.authUserId || '';
    if (goTrueId) {
      const banR = await request('POST',
        `${SUPABASE_URL}/auth/v1/admin/users/${goTrueId}`,
        JSON.stringify({ ban_duration: 'none' }),
        { 'apikey': SVC, 'Authorization': `Bearer ${SVC}`, 'Content-Type': 'application/json' }
      );
      console.log('  GoTrue unban:', banR.status);
    }
  }

  // ── SEC-BU-CREATE: Create BU_SUPPORT in POSSAP ──
  console.log('\n--- SEC-BU-CREATE ---');
  const buEmail = `qa_bu_${Date.now()}@4coreqa.local`;
  const buPass  = 'QA_Pass_2026!';
  r = await post('/api/users', {
    name: 'QA BU Support', email: buEmail, role: 'BU_SUPPORT',
    bu: 'POSSAP', password: buPass,
  }, csrf());
  const buUserId = r.body?.id;
  rec('SEC-BU-CREATE', { status: r.status, id: buUserId }, r.status === 201 ? 'PASS' : 'FAIL');

  // Fix BU support: is_active=true, must_change_password=false via direct Supabase
  if (buUserId && r.status === 201) {
    const fixR = await request('PATCH',
      `${SUPABASE_URL}/rest/v1/users?id=eq.${buUserId}`,
      JSON.stringify({ is_active: true, must_change_password: false }),
      { 'apikey': SVC, 'Authorization': `Bearer ${SVC}`, 'Prefer': 'return=minimal', 'Content-Type': 'application/json' }
    );
    console.log('  Fix BU active:', fixR.status);
  }

  // ── SEC-TKT-CREATE: PII ticket ──
  console.log('\n--- SEC-TKT-CREATE ---');
  const tktId = `QA_TKT_${Date.now()}`;
  const slaDeadline = new Date(Date.now() + 24*3600*1000).toISOString();
  r = await post('/api/tickets', {
    id: tktId,
    customerName: 'PII Customer', customerEmail: 'pii@test.com',
    customerPhone: '08012345678', customerId: 'cust-seed-1',
    businessUnit: 'POSSAP', partner: 'QA_PARTNER',
    category: 'Payment Dispute', issueType: 'Duplicate Debit',
    priority: 'HIGH', status: 'RECEIPT', slaDeadline,
    cardPan: '4111111111111111',
    description: 'PII test for unmask bypass',
    submittedBy: 'BU_SUPPORT', submittedByName: 'QA Admin',
  }, csrf());
  rec('SEC-TKT-CREATE', { id: tktId, status: r.status, serverId: r.body?.id },
    r.status === 201 ? 'PASS' : 'FAIL', 'CRITICAL');

  // ── SEC-18: THE CRITICAL UNMASK BYPASS TEST ──
  console.log('\n--- SEC-18: PARTNER unmask bypass ---');
  const rPartnerLogin = await login(partnerEmail, partnerPass);
  console.log('  Partner login:', rPartnerLogin.status, JSON.stringify(rPartnerLogin.body).slice(0, 200));
  if (rPartnerLogin.status === 200) {
    const rList = await get('/api/tickets?unmask=true');
    const list = Array.isArray(rList.body) ? rList.body : [];
    const myTicket = list.find(t => t.id === tktId);
    const bypassList = !!myTicket && myTicket.cardPan === '4111111111111111';
    rec('SEC-18a', { found: !!myTicket, pan: myTicket?.cardPan, bypassed: bypassList },
      bypassList ? 'FAIL-BYPASS' : 'PASS', 'CRITICAL');

    const rDetail = await get(`/api/tickets/${tktId}?unmask=true`);
    const bypassDetail = rDetail.status === 200 &&
      rDetail.body?.cardPan === '4111111111111111' &&
      rDetail.body?.customerEmail === 'pii@test.com';
    rec('SEC-18b', { status: rDetail.status, pan: rDetail.body?.cardPan, bypassed: bypassDetail },
      bypassDetail ? 'FAIL-BYPASS' : 'PASS', 'CRITICAL');

    // Also test mask=default (no unmask param) — should be masked for PARTNER
    const rMasked = await get(`/api/tickets/${tktId}`);
    const properlyMasked = rMasked.status === 200 &&
      rMasked.body?.cardPan !== '4111111111111111';
    rec('SEC-18c', { status: rMasked.status, pan: rMasked.body?.cardPan },
      properlyMasked ? 'PASS-MASKED' : 'FAIL', 'CRITICAL');

    r = await login(QA_EMAIL, QA_PASS);
    console.log('  Re-login QA:', r.status);
  } else {
    rec('SEC-18', { error: 'Partner login failed', details: rPartnerLogin.body }, 'FAIL', 'CRITICAL');
    r = await login(QA_EMAIL, QA_PASS);
  }

  // ── SEC-03b: CSRF valid token ──
  console.log('\n--- SEC-03b: CSRF valid token ---');
  r = await patch(`/api/tickets/${tktId}`, { description: 'csrf-ok-test' }, csrf());
  rec('SEC-03b', { status: r.status },
    r.status === 200 ? 'PASS' : 'FAIL');

  // ── SEC-19: PARTNER denied /api/users ──
  console.log('\n--- SEC-19: RBAC ---');
  const rPartnerAgain = await login(partnerEmail, partnerPass);
  console.log('  Partner re-login:', rPartnerAgain.status);
  if (rPartnerAgain.status === 200) {
    r = await get('/api/users');
    rec('SEC-19', { status: r.status }, r.status === 403 ? 'PASS' : 'FAIL');
    r = await login(QA_EMAIL, QA_PASS);
  }

  // ── SEC-21/21b: Tenant isolation ──
  console.log('\n--- SEC-21: Tenant isolation ---');
  const otherTktId = `QA_TKT_OTHER_${Date.now()}`;
  r = await post('/api/tickets', {
    id: otherTktId,
    customerName: 'IDEC Customer', customerEmail: 'idec@test.com', customerId: 'cust-seed-3',
    businessUnit: 'CORPORATE', partner: 'QA_PARTNER',
    category: 'Settlement Delay', issueType: 'Cross-BU test',
    priority: 'LOW', status: 'RECEIPT', slaDeadline,
    description: 'other BU test',
    submittedBy: 'BU_SUPPORT', submittedByName: 'QA Admin',
  }, csrf());
  console.log('  Other BU ticket:', r.status);

  const rAllTickets = await get('/api/tickets');
  const allTickets = Array.isArray(rAllTickets.body) ? rAllTickets.body : [];
  const supAdmHasAll = allTickets.some(t => t.id === tktId) && allTickets.some(t => t.id === otherTktId);
  rec('SEC-21', { total: allTickets.length, hasBoth: supAdmHasAll },
    supAdmHasAll ? 'PASS-SUPER_ADMIN-GLOBAL' : 'FAIL', 'HIGH');

  const rBULogin = await login(buEmail, buPass);
  console.log('  BU login:', rBULogin.status);
  if (rBULogin.status === 200) {
    const rBUList = await get('/api/tickets');
    const buTickets = Array.isArray(rBUList.body) ? rBUList.body : [];
    const buHasOwn = buTickets.some(t => t.id === tktId);
    const buHasOther = buTickets.some(t => t.id === otherTktId);
    rec('SEC-21b', { returned: buTickets.length, hasOwn: buHasOwn, hasOther: buHasOther },
      buHasOwn && !buHasOther ? 'PASS-ISOLATED' : 'FAIL', 'HIGH');
    r = await login(QA_EMAIL, QA_PASS);
  }

  // ── SEC-30: Audit immutability ──
  console.log('\n--- SEC-30: Audit immutability ---');
  r = await post('/api/audit-log', {
    ticketId: tktId, actor: 'QA', role: 'SUPER_ADMIN',
    action: 'QA_TEST', details: 'SEC-30 test',
  }, csrf());
  rec('SEC-30-a', { appendStatus: r.status }, r.status === 201 ? 'PASS' : 'FAIL');
  const auditId = r.body?.id;
  const rAuditPatch = await patch(`/api/audit-log/${auditId}`, { details: 'tamper' }, csrf());
  rec('SEC-30-b', { patchStatus: rAuditPatch.status },
    rAuditPatch.status === 404 || rAuditPatch.status === 403 ? 'PASS-NO-MUTATION' : 'FAIL');

  // ── SEC-02: Lockout ──
  console.log('\n--- SEC-02: Lockout ---');
  const lockUserEmail = buEmail;
  const lockWrong = 'QA_WRONG_LOCKOUT_999';
  const attempts = [];
  for (let i = 0; i < 6; i++) {
    const ar = await login(lockUserEmail, lockWrong);
    attempts.push(ar.status);
    console.log(`  Attempt ${i+1}: ${ar.status}`);
  }
  const locked = attempts[5] === 423 || attempts[5] === 429;
  rec('SEC-02', { attempts, locked }, locked ? 'PASS' : 'FAIL', 'HIGH');
  const rLockedStill = await login(lockUserEmail, buPass);
  console.log('  Locked-user login:', rLockedStill.status);

  // ── SEC-06/07: Session ──
  console.log('\n--- SEC-06/07: Session ---');
  const me1 = await get('/api/auth/me');
  const me2 = await get('/api/auth/me');
  rec('SEC-06', { id1: me1.body?.user?.id, id2: me2.body?.user?.id },
    me1.status === 200 && me2.status === 200 ? 'PASS' : 'FAIL');
  r = await post('/api/auth/logout', {}, csrf());
  const meAfter = await get('/api/auth/me');
  rec('SEC-07', { logout: r.status, meAfter: meAfter.status },
    r.status === 200 && meAfter.status === 401 ? 'PASS' : 'FAIL');

  // ── SEC-46: Health ──
  const rHealth = await get('/api/health');
  rec('SEC-46', rHealth.body, rHealth.status === 200 && rHealth.body?.ok === true ? 'PASS' : 'FAIL');

  // ── SEC-08: Super-admin masked view ──
  console.log('\n--- SEC-08: Masked super-admin view ---');
  r = await login(QA_EMAIL, QA_PASS);
  const rListM = await get('/api/tickets');
  const listM = Array.isArray(rListM.body) ? rListM.body : [];
  const tktM = listM.find(t => t.id === tktId);
  rec('SEC-08-mask', { pan: tktM?.cardPan },
    tktM && tktM.cardPan !== '4111111111111111' ? 'PASS-MASKED' : 'PARTIAL', 'HIGH');

  // Write results
  const out = { timestamp: new Date().toISOString(), results: RESULTS,
    testData: [
      { id: partnerId, type: 'PARTNER test user' },
      { id: buUserId,  type: 'BU_SUPPORT test user' },
      { id: tktId,     type: 'PII ticket (POSSAP)' },
      { id: otherTktId, type: 'Isolation ticket (CORPORATE)' },
    ]
  };
  await fsp.mkdir('qa/evidence', { recursive: true });
  await fsp.writeFile('qa/evidence/critical-results-v2.json', JSON.stringify(out, null, 2));
  console.log('\n=== Written to qa/evidence/critical-results-v2.json ===');
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });