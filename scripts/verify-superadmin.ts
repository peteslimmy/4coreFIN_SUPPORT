import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { supabase } from '../server/supabase';
import { toAuthUser } from '../server/auth';

const JWT_SECRET = process.env.JWT_SECRET!;

async function main() {
  // Fetch SUPER_ADMIN user row
  const { data: admin } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'peteslimmy@gmail.com')
    .single();

  if (!admin) { console.log('SUPER_ADMIN not found in users table'); return; }

  // Convert to AuthUser (same as server does)
  const authUser = toAuthUser(admin as any);

  // Generate a JWT the same way the server does
  const token = jwt.sign(
    {
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role,
      bu: authUser.bu,
      name: authUser.name,
      tenantId: authUser.tenantId,
    } as any,
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  // Decode and inspect the payload
  const decoded = jwt.decode(token) as any;
  console.log('\n=== SUPER_ADMIN JWT payload ===');
  console.log(JSON.stringify(decoded, null, 2));

  // Also call listTickets via a route test
  console.log('\n=== SUPER_ADMIN user attributes used by listTickets ===');
  console.log('role:', authUser.role);
  console.log('isGlobalRole:', require('../server/rbac').isGlobalRole(authUser.role));
  console.log('tenantScope:', require('../server/repository').tenantScope?.(authUser) ?? '(not exported)');
}

main().catch(err => { console.error(err); process.exit(1); });