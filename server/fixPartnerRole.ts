import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error('SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set');
  process.exit(1);
}

function runSql(query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fix() {
  // Remap roles after the provider→partner rename.
  // PROVIDER (old payment-partner role) → PARTNER.
  // Old PARTNER (customer-style bu-scoped role) → CUSTOMER.
  const r1 = await runSql("UPDATE users SET role = 'PARTNER' WHERE role = 'PROVIDER'");
  console.log('Update users (PROVIDER->PARTNER):', r1.status, r1.status === 200 ? 'OK' : JSON.stringify(r1.data).substring(0, 100));
  const r1b = await runSql("UPDATE users SET role = 'CUSTOMER' WHERE role = 'PARTNER'");
  console.log('Update users (PARTNER->CUSTOMER):', r1b.status, r1b.status === 200 ? 'OK' : JSON.stringify(r1b.data).substring(0, 100));

  // Update submitted_by in tickets
  const r2 = await runSql("UPDATE tickets SET submitted_by = 'PARTNER' WHERE submitted_by = 'PROVIDER'");
  console.log('Update tickets:', r2.status, r2.status === 200 ? 'OK' : JSON.stringify(r2.data).substring(0, 100));

  // Verify
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY must be set to verify');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const { data: users } = await supabase.from('users').select('name, role, email');
  console.log('\nUsers now:');
  users?.forEach(u => console.log(` - ${u.name} (${u.role}) ${u.email}`));
}

fix().catch(console.error);
