import { createClient } from '@supabase/supabase-js';
import { E2E_USERS, E2E_PASSWORD } from '../e2e/identity.ts';

const url = 'https://kflxtzlwyxphfoghfvzq.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmbHh0emx3eXhwaGZvZ2hmdnpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg1NTU3MCwiZXhwIjoyMTAwNDMxNTcwfQ.sAwICOADoqcvWm3sSkEUBaNZ_N4jb_W66LaghHFbIN4';

async function main() {
  console.log('Testing with E2E_PASSWORD:', E2E_PASSWORD);
  console.log('Expected users:', E2E_USERS.map(u => u.email));

  const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 100 });
  const allUsers = list?.users || [];
  const e2eUsers = allUsers.filter((u: any) => String(u.email || '').includes('.e2e'));

  console.log('\nE2E users in GoTrue:', e2eUsers.length);
  for (const u of e2eUsers) {
    console.log(' -', u.id.slice(0, 8), u.email, 'confirmed=' + !!u.email_confirmed_at);
  }

  // try logging in as each e2e user with E2E_PASSWORD
  console.log('\nLogin attempts:');
  for (const u of e2eUsers.slice(0, 3)) {
    const { error } = await sb.auth.signInWithPassword({ email: u.email, password: E2E_PASSWORD });
    console.log(' -', u.email, error?.message || 'OK');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });