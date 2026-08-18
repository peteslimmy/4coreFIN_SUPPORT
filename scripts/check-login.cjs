import { createClient } from '@supabase/supabase-js';
import { RUN_ID, E2E_PASSWORD, E2E_USERS } from './e2e/identity.ts';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

async function main() {
  console.log('RUN_ID:', RUN_ID);
  console.log('E2E_PASSWORD:', E2E_PASSWORD);
  console.log('possap:', E2E_USERS.find((u) => u.key === 'possap')?.email);

  const email = E2E_USERS.find((u) => u.key === 'possap')?.email;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  console.log('signIn:', error?.message || 'OK', 'user:', data?.user?.email);

  const { data: users } = await supabase.from('users').select('id,email,role,bu').ilike('email', '%@%.e2e');
  console.log('users in e2e domain:', (users || []).length);
  for (const u of users || []) console.log(' -', u.id.slice(0, 8), u.email, u.role, u.bu);
}

main().catch((e) => { console.error(e); process.exit(1); });