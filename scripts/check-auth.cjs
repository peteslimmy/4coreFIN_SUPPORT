import { createClient } from '@supabase/supabase-js';

const url = 'https://kflxtzlwyxphfoghfvzq.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmbHh0emx3eXhwaGZvZ2hmdnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTU1NzAsImV4cCI6MjEwMDQzMTU3MH0.jbmGG4cszDnQcYfkRkMLMqWrbDPuvx3MPRwlRTz_7yo';

const sb = createClient(url, key);

async function main() {
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 100 });
  const all = data?.users || [];
  const hits = all.filter((u) => String(u.email || '').includes('e2efixed'));
  console.log('GoTrue users with e2efixed:', hits.length);
  for (const u of hits) console.log(' -', u.id.slice(0, 8), u.email, 'confirmed=' + !!u.email_confirmed_at);
}

main().catch((e) => { console.error(e); process.exit(1); });