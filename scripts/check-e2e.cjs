import { E2E_USERS, E2E_PASSWORD } from './e2e/identity.ts';
import { supabase } from './server/supabase.ts';

async function main() {
  console.log('RUN_ID domain would be:', E2E_USERS[0].email.split('@')[1]);
  console.log('password prefix:', E2E_PASSWORD.slice(0, 6));

  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, bu, is_active')
    .ilike('email', '%@%.e2e');

  console.log('DB users in e2e domain:', (data || []).length);
  for (const u of data || []) {
    console.log(' -', u.id.slice(0, 8), u.email, u.role, u.bu, 'active=' + u.is_active);
  }

  // try supabase auth login with a known user
  const email = E2E_USERS[0].email;
  const { data: session, error: loginErr } = await supabase.auth.signInWithPassword({
    email, password: E2E_PASSWORD,
  });
  console.log('direct auth login:', loginErr?.message || 'OK user=' + session?.user?.email);
}

main().catch((e) => { console.error(e); process.exit(1); });