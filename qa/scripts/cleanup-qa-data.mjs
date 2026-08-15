import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

function req(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, env.SUPABASE_URL.endsWith('/') ? env.SUPABASE_URL : env.SUPABASE_URL + '/');
    const mod = url.protocol === 'https:' ? https : http;
    const r = mod.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: opts.method || 'GET',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
          ...opts.headers,
        },
      },
      (x) => {
        let d = '';
        x.on('data', (c) => (d += c));
        x.on('end', () => {
          let body = d;
          try { body = JSON.parse(d); } catch {}
          resolve({ status: x.statusCode, body });
        });
      }
    );
    r.on('error', reject);
    if (opts.body) r.write(JSON.stringify(opts.body));
    r.end();
  });
}

const JSONHEAD = { 'Content-Type': 'application/json' };

// ── 1. QA app users to remove (email list) ──
const QA_USER_EMAILS = [
  'qa_partner_1786821730046@4coreqa.local',
  'qa_partner_1786821855258@4coreqa.local',
  'qa_bu_1786821861974@4coreqa.local',
  'qa_partner2_1786824908145@4coreqa.local',
  'qa_bu_1786824910258@4coreqa.local',
  'qa_partner2_1786824953177@4coreqa.local',
  'qa_bu_1786824955153@4coreqa.local',
];

// ── 2. QA tickets to remove ──
const QA_TICKETS = [
  'QA_TKT_1786824911886',
  'QA_TKT_OTHER_1786824923036',
  'QA_TKT_1786824956974',
  'QA_TKT_OTHER_1786824968232',
];

// ── 3. Customers created by QA runs (identified earlier) ──
const QA_CUSTOMERS = [
  'cust-1786821857497-ka1dh',
  'cust-1786824912637-bmndd',
  'cust-1786824923761-k3vdj',
];

const log = [...new Array(4)].map(() => []);
const out = [];

// 1. Remove GoTrue auth identities
for (const email of QA_USER_EMAILS) {
  const list = await req('auth/v1/admin/users?per_page=50');
  const u = (list.body?.users || []).find((x) => x.email === email);
  if (u) {
    const del = await req(`auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: JSONHEAD });
    log[0].push(`gotrue ${email} -> ${del.status}`);
  } else {
    log[0].push(`gotrue ${email} -> not found`);
  }
}

// 2. Remove app user rows
for (const email of QA_USER_EMAILS) {
  const del = await req(`rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: { ...JSONHEAD, Prefer: 'return=minimal' },
  });
  log[1].push(`appuser ${email} -> ${del.status}`);
}

// 3. Audit notes: the audit_log is append-only by design (hash chain, verified valid
//    for 1000 entries). QA-generated audit entries are legitimate records of QA activity
//    and MUST NOT be deleted — scrubbing the chain would break hash linkage and defeat
//    the tamper-evidence guarantee. Tickets reference audit entries; check FK behavior.
for (const id of QA_TICKETS) {
  const chk = await req(`rest/v1/audit_log?select=id&ticket_id=eq.${encodeURIComponent(id)}&limit=5`);
  log[2].push(`audit refs for ${id}: ${Array.isArray(chk.body) ? chk.body.length : 'n/a'}`);
}

// 4. Remove tickets
for (const id of QA_TICKETS) {
  const del = await req(`rest/v1/tickets?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...JSONHEAD, Prefer: 'return=minimal' },
  });
  log[3].push(`ticket ${id} -> ${del.status}`);
}

// 5. Remove the QA customers (should be orphaned after ticket delete)
for (const id of QA_CUSTOMERS) {
  const del = await req(`rest/v1/customers?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...JSONHEAD, Prefer: 'return=minimal' },
  });
  log[3].push(`customer ${id} -> ${del.status}`);
}

for (const l of log) out.push(...l);
fs.writeFileSync('qa/evidence/cleanup-log.txt', out.join('\n') + '\n');
console.log(out.join('\n'));
process.exit(0);