import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
    try {
        console.log('Testing update of single setting...');
        const { error } = await supabase
          .from('system_settings')
          .upsert({ key: 'smtp.host', value: 'smtp.mailersend.net', updated_by: 'test', updated_at: new Date().toISOString() }, { onConflict: 'key' });
        
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Single setting update successful!');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testUpdate();
