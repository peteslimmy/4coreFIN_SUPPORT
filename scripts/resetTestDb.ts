/**
 * Wipes the DEDICATED TEST project: calls reset_test_schema() (migration 041),
 * which truncates every app table and deletes ALL auth.users.
 *
 * Requires .env.test with SUPABASE_URL + SUPABASE_SERVICE_KEY for the TEST
 * project (gitignored). Refuses to run when .env.test is missing.
 *
 * Usage: npx tsx scripts/resetTestDb.ts
 */

import { existsSync } from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const envFile = '.env.test';
if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error(
    'Missing .env.test (SUPABASE_URL / SUPABASE_SERVICE_KEY).\n' +
      'Copy .env.test.example to .env.test and fill in the TEST project values.'
  );
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { error } = await supabase.rpc('reset_test_schema');
  if (error) {
    console.error('reset_test_schema() failed:', error.message);
    console.log('Has migration 041 been applied? Run: npm run test:prepare');
    process.exit(1);
  }
  console.log('Test project reset.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});