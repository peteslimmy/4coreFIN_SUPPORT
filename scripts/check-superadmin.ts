import 'dotenv/config';
import { supabase } from '../server/supabase';
import { cleanupE2eData } from '../e2e/provision';

async function main() {
  console.log('=== SUPER_ADMIN users in app DB ===');
  const { data: admins, error } = await supabase
    .from('users')
    .select('id, email, role, bu, partner, partner_org_id, tenant_id')
    .eq('role', 'SUPER_ADMIN');
  if (error) console.error('Error:', error.message);
  else console.log(JSON.stringify(admins, null, 2));

  console.log('\n=== All E2E users in app DB ===');
  const { data: e2eUsers } = await supabase
    .from('users')
    .select('id, email, role, bu, partner, partner_org_id, tenant_id')
    .like('email', 'e2e.%@%.e2e');
  if (e2eUsers) console.log(JSON.stringify(e2eUsers, null, 2));

  console.log('\n=== All E2E GoTrue identities ===');
  const { data: gotrue } = await supabase.auth.admin.listUsers({ page: 1, perPage: 10000 });
  const e2eGoTrue = (gotrue?.users ?? []).filter(u => (u.email || '').includes('@') && (u.email || '').includes('.e2e'));
  for (const u of e2eGoTrue) {
    console.log(`  ${u.id}  ${u.email}  confirmed=${u.email_confirmed_at ? 'yes' : 'no'}`);
  }

  console.log('\n=== Running cleanupE2eData() ===');
  await cleanupE2eData();
  console.log('\n=== Cleanup complete ===');
}

main().catch(err => { console.error(err); process.exit(1); });