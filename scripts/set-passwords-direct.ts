import 'dotenv/config';
import https from 'https';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const PASSWORD = 'E2e!fixed123';

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
          apikey: SERVICE_KEY,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, raw: data }); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const paths = [
  '/auth/v1/admin/users',
  '/api/auth/v1/admin/users',
  '/auth/v1/users',
];

async function main() {
  for (const p of paths) {
    const result = await mgmtApi('GET', p);
    const count = (result.body?.users ?? []).length;
    console.log(`GET ${p} => ${result.status} (${count} users)`);
    if (count > 0) {
      console.log('  sample:', (result.body.users as Array<{ email?: string }>).slice(0, 2).map((u: { email?: string }) => u.email).join(', '));
    }
  }

  // Try setting password via the path that returns users
  const listPath = paths.find(p => {
    const r = mgmtApi('GET', p);
    return r.then(res => (res.body?.users ?? []).length > 0);
  });

  console.log('\nDetecting working path...');
  for (const p of paths) {
    const result = await mgmtApi('GET', p);
    if ((result.body?.users ?? []).length > 0) {
      console.log(`Using path: ${p}`);
      const users = result.body.users as Array<{ id: string; email?: string }>;
      const e2eUsers = users.filter((u) => String(u.email || '').match(/^e2e\.[^@]+@.+\.e2e$/i));
      console.log(`E2E users to update: ${e2eUsers.length}`);

      for (const u of e2eUsers) {
        const putResult = await mgmtApi('PUT', `${p}/${u.id}`, { password: PASSWORD, email_confirm: true });
        console.log(`  ${u.email}: ${putResult.status} ${JSON.stringify(putResult.body).slice(0, 80)}`);
      }

      // Verify
      for (const u of e2eUsers) {
        const signIn = await mgmtApi('POST', '/auth/v1/token?grant_type=password', { email: u.email, password: PASSWORD });
        const ok = signIn.body?.access_token;
        console.log(`  login ${u.email}: ${ok ? 'OK' : 'FAILED — ' + JSON.stringify(signIn.body).slice(0, 80)}`);
      }
      break;
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });