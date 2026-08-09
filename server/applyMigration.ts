import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kflxtzlwyxphfoghfvzq.supabase.co';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'kflxtzlwyxphfoghfvzq';

async function applyMigration() {
  try {
    if (!SUPABASE_ACCESS_TOKEN) {
      console.error('Missing SUPABASE_ACCESS_TOKEN. Add it to your .env file.');
      process.exit(1);
    }
    console.log('Reading migration file 023...');
    const migrationSQL = readFileSync(
      join(process.cwd(), 'supabase/migrations/023_landing_page_images.sql'),
      'utf-8'
    );

    console.log('Applying migration to Supabase...');
    
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: migrationSQL
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Migration failed:', error);
      console.log('\n⚠️  Please apply migration manually:');
      console.log('1. Go to https://supabase.com/dashboard/project/kflxtzlwyxphfoghfvzq/editor');
      console.log('2. Click "SQL Editor"');
      console.log('3. Paste contents of supabase/migrations/023_landing_page_images.sql');
      console.log('4. Click "Run"');
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Migration applied successfully!');
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

applyMigration();