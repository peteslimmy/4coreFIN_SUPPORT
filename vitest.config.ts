import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import dotenv from 'dotenv';

// Load .env.test ourselves so this config can decide whether integration tests
// (tests/*) can run: they need real test-project credentials and will fail at
// import time (server/supabase.ts) without them. When missing, only the unit
// tests under src/ run — exactly the pre-migration behavior for local dev.
const envFile = '.env.test';
let testEnvReady = false;
if (existsSync(envFile)) {
  const parsed = dotenv.parse(readFileSync(envFile, 'utf8'));
  testEnvReady = Boolean(
    parsed.SUPABASE_URL && parsed.SUPABASE_SERVICE_KEY && parsed.SUPABASE_ANON_KEY && parsed.JWT_SECRET
  );
}

if (!testEnvReady) {
  // CI / shell may pass the same variables directly.
  testEnvReady = Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_KEY &&
      process.env.SUPABASE_ANON_KEY &&
      process.env.JWT_SECRET
  );
}

const integrationInclude = testEnvReady ? ['tests/**/*.test.{ts,tsx}'] : [];

if (!testEnvReady) {
  console.warn(
    '[vitest] .env.test (or SUPABASE_* + JWT_SECRET env vars) not found — integration tests under tests/ will be skipped. ' +
      'See .env.test.example and scripts/prepareTestDb.ts.'
  );
}

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/helpers/envSetup.ts', './src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', ...integrationInclude],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});