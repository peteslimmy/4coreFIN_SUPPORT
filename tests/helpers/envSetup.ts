/**
 * Loads .env.test BEFORE any server module evaluates.
 *
 * server/supabase.ts reads process.env at import time, so the test-project
 * credentials must exist before the first import of server code. This file runs
 * first in vitest.config.ts setupFiles so .env.test (gitignored) wins over the
 * dev .env that src/test-setup.ts later loads via dotenv/config.
 *
 * Values already present in the real process environment (e.g. injected by CI)
 * are left untouched so CI can supply the same variables directly.
 */

import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

export const TEST_ENV_FILE = '.env.test';

export function loadTestEnv(): boolean {
  if (!existsSync(TEST_ENV_FILE)) return false;
  const parsed = dotenv.parse(readFileSync(TEST_ENV_FILE, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && !(key in process.env)) {
      process.env[key] = value;
    }
  }
  return true;
}

/** True once test credentials are available from the environment. */
export function testCredentialsAvailable(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_KEY &&
      process.env.SUPABASE_ANON_KEY &&
      process.env.JWT_SECRET
  );
}

/** Called at import time; runs before any server module import. */
export const testEnvLoaded: boolean = loadTestEnv();