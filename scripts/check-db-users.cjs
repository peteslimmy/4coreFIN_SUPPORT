const fs = require('fs');
const https = require('https');
const env = {};
for (const m of fs.readFileSync('.env', 'utf8').matchAll(/^([A-Z0-9_]+)="?([^\r\n"]*)"?$/gm)) env[m[1]] = m[2];

function mgmtSql(query) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  const users = await mgmtSql("SELECT email, role, bu FROM users WHERE email ILIKE '%@e2efixed.e2e' ORDER BY email");
  console.log('e2efixed users in users table:', (users.data || users || []).length);
  for (const u of (users.data || users || [])) console.log(' -', u.email, u.role, u.bu);
})().catch((e) => console.error(e));