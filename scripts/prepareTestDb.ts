/**
 * Applies every migration (001 .. 041) to the DEDICATED TEST project.
 *
 * Requires .env.test (copy from .env.test.example) PLUS:
 *   TEST_SUPABASE_PROJECT_REF      — the test project ref (e.g. 'abcde...')
 *   TEST_SUPABASE_ACCESS_TOKEN     — a Supabase personal access token (sbp_...)
 *
 * The test project must be disposable: migration 041 adds reset_test_schema(),
 * which truncates every app table and deletes ALL auth.users.
 *
 * Usage: npx tsx scripts/prepareTestDb.ts
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import dotenv from 'dotenv';

const envFile = '.env.test';
if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

const PROJECT_REF = process.env.TEST_SUPABASE_PROJECT_REF || '';
const ACCESS_TOKEN = process.env.TEST_SUPABASE_ACCESS_TOKEN || '';

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error(
    'Missing TEST_SUPABASE_PROJECT_REF / TEST_SUPABASE_ACCESS_TOKEN in .env.test.\n' +
      'Copy .env.test.example to .env.test and fill in the test-project values.\n'
  );
  process.exit(1);
}

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

async function apply(sql: string, label: string): Promise<void> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    console.error(`✗ ${label} failed:`, err.slice(0, 2000));
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  if (files.length === 0) {
    throw new Error('No migration files found in supabase/migrations/');
  }

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await apply(sql, basename(file));
  }

  console.log('\nTest project ready. Integration tests will now use reset_test_schema().');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});