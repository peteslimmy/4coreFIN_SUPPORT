import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

console.log('Starting test...');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'SET' : 'NOT SET');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables');
  process.exit(1);
}

console.log('Creating supabase client...');
const supabase = createClient(supabaseUrl, supabaseKey);
console.log('Supabase client created:', !!supabase);

console.log('Test completed successfully.');

