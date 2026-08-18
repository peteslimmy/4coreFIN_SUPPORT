import { supabase } from '../server/supabase';
import bcrypt from 'bcryptjs';

async function main() {
  const email = 'e2e.possap@e2efixed.e2e';
  const password = 'E2e!e2efixed';

  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
  const existing = (list?.users || []).find((u: any) => String(u.email || '').toLowerCase() === email);
  if (existing) {
    console.log('user exists, id=', existing.id);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: 'E2E POSSAP Support' },
    });
    console.log('created:', data?.user?.id, error?.message);
  }

  const hash = await bcrypt.hash(password, 10);
  const { error: upErr } = await supabase.from('users').upsert({
    id: 'usr-e2e-possap-e2epossape2efixede2e',
    name: 'E2E POSSAP Support', email, password_hash: hash,
    role: 'BU_SUPPORT', bu: 'POSSAP', phone: '',
    tenant_id: '', account_type: 'BU', must_change_password: false, is_active: true,
  });
  console.log('upsert user row:', upErr?.message || 'ok');
}
main().catch((e) => { console.error(e); process.exit(1); });