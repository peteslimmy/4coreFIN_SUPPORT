import 'dotenv/config';

async function main() {
  const { provisionTestUsers } = await import('../e2e/provision');
  const { E2E_USERS, E2E_PASSWORD } = await import('../e2e/identity');

  console.log('1. provisioning...');
  await provisionTestUsers();

  const { isAccountLocked } = await import('../server/services/lockoutService');
  const auth = await import('../server/auth');
  const { supabase } = await import('../server/supabase');

  const u = E2E_USERS.find((x) => x.key === 'superadmin')!;
  console.log('2. target user:', u.email, 'password:', E2E_PASSWORD);

  const lock = await isAccountLocked(u.email);
  console.log('3. lockout:', JSON.stringify(lock));

  const row = await supabase.from('users').select('id,email,is_active,must_change_password,auth_user_id').eq('email', u.email).maybeSingle();
  console.log('4. app users row:', JSON.stringify(row.data), row.error?.message ?? '');

  try {
    const r = await auth.supabaseSignIn(u.email, E2E_PASSWORD, '127.0.0.1', 'diag');
    console.log('5. supabaseSignIn OK:', JSON.stringify(r));
  } catch (e: any) {
    console.log('5. supabaseSignIn FAILED:', e.message, 'code:', e.code);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
