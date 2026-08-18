import 'dotenv/config';
import https from 'https';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const PASSWORD = 'E2e!fixed123';

interface GoTrueUser {
  id: string;
  email?: string;
}

function mgmtApi(method: string, path: string, body?: unknown): Promise<any> {
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
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  // 1. List all GoTrue users
  const list = await mgmtApi('GET', '/auth/v1/admin/users');
  const e2eUsers = (list.users ?? []).filter(
    (u: GoTrueUser) => String(u.email || '').match(/^e2e\.[^@]+@.+\.e2e$/i)
  );
  console.log(`Found ${e2eUsers.length} E2E GoTrue users:`);
  for (const u of e2eUsers) {
    console.log(`  ${u.id}  ${u.email}`);
  }

  // 2. Update each user's password using the GoTrue admin API directly
  console.log(`\nUpdating passwords to "${PASSWORD}"...`);
  for (const u of e2eUsers) {
    const result = await mgmtApi('PUT', `/auth/v1/admin/users/${u.id}`, {
      password: PASSWORD,
      email_confirm: true,
    });
    const ok = result && !result.code;
    console.log(`  ${u.email}: ${ok ? 'OK' : 'FAILED — ' + JSON.stringify(result).slice(0, 120)}`);
  }

  // 3. Verify by attempting sign-in for each user
  console.log('\nVerifying credentials via signInWithPassword...');
  for (const u of e2eUsers) {
    const signIn = await mgmtApi('POST', '/auth/v1/token?grant_type=password', {
      email: u.email,
      password: PASSWORD,
    });
    const ok = signIn && signIn.access_token;
    console.log(`  ${u.email}: ${ok ? 'LOGIN OK' : 'FAILED — ' + JSON.stringify(signIn).slice(0, 120)}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });