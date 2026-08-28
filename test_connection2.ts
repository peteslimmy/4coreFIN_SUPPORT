
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Testing connection with schema-qualified table name...');
supabase.from('organization.business_units').select('buid, name').limit(5).then(({ data, error }) => {
  if (error) {
    console.error('Connection error:', error);
    return;
  }
  console.log('Connection successful');
  console.log('Number of rows:', data.length);
  data.forEach(row => {
    console.log(row.buid + ' (' + row.name + ')');
  });
}).catch(err => {
  console.error('Unexpected error:', err);
});

