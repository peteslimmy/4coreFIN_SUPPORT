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
// Placeholder detection (QA-02): placeholder strings are truthy, so without
// this guard vitest would silently run integration tests against a
// non-existent project and fail confusingly at setup time.
const PLACEHOLDER_MARKERS = ['your-test-project', 'please-change-me', 'your-test-project-service-role-key', 'your-test-project-anon-key'];
function isPlaceholder(value: string | undefined): boolean {
  return !value || PLACEHOLDER_MARKERS.some((marker) => value.includes(marker));
}
if (existsSync(envFile)) {
  const parsed = dotenv.parse(readFileSync(envFile, 'utf8'));
  testEnvReady = Boolean(
    !isPlaceholder(parsed.SUPABASE_URL) &&
      !isPlaceholder(parsed.SUPABASE_SERVICE_KEY) &&
      !isPlaceholder(parsed.SUPABASE_ANON_KEY) &&
      !isPlaceholder(parsed.JWT_SECRET)
  );
}

if (!testEnvReady) {
  // CI / shell may pass the same variables directly.
  testEnvReady = Boolean(
    !isPlaceholder(process.env.SUPABASE_URL) &&
      !isPlaceholder(process.env.SUPABASE_SERVICE_KEY) &&
      !isPlaceholder(process.env.SUPABASE_ANON_KEY) &&
      !isPlaceholder(process.env.JWT_SECRET)
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