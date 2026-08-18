import { E2E_USERS, E2E_PASSWORD } from './e2e/identity.ts';
import { supabase } from './server/supabase.ts';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('RUN_ID users:', E2E_USERS.map(u => u.email));
  console.log('password:', E2E_PASSWORD);

  for (const u of E2E_USERS) {
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    const existing = (list?.users || []).find((x: any) => String(x.email || '').toLowerCase() === u.email.toLowerCase());

    if (existing) {
      console.log('AUTH exists:', u.key, existing.id.slice(0, 8));
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email, password: E2E_PASSWORD, email_confirm: true, user_metadata: { full_name: u.name },
      });
      console.log('AUTH created:', u.key, data?.user?.id || error?.message);
    }

    const hash = await bcrypt.hash(E2E_PASSWORD, 10);
    const { error: upErr } = await supabase.from('users').upsert({
      id: `usr-e2e-${u.key}-${u.email.replace(/[^a-z0-9]/gi, '')}`,
      name: u.name, email: u.email, password_hash: hash,
      role: u.role, bu: u.bu, phone: '',
      tenant_id: '', account_type: u.role === 'PARTNER' ? 'PARTNER' : 'BU',
      must_change_password: false, is_active: true,
    });
    console.log('USER upsert:', u.key, upErr?.message || 'ok');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });