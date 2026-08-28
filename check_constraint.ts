
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Checking constraint on organization.business_units...');
supabase
  .from('information_schema.table_constraints')
  .select('constraint_name, constraint_type, check_clause')
  .eq('table_schema', 'organization')
  .eq('table_name', 'business_units')
  .eq('constraint_name', 'business_units_buid_check')
  .then(({ data, error }) => {
    if (error) {
      console.error('Error checking constraint:', error);
      return;
    }
    if (data.length === 0) {
      console.log('Constraint business_units_buid_check not found');
    } else {
      console.log('Constraint found:');
      data.forEach(row => {
        console.log('  Name: ' + row.constraint_name);
        console.log('  Type: ' + row.constraint_type);
        console.log('  Check clause: ' + row.check_clause);
      });
    }
  });

