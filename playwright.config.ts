import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsxBin = path.join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const PORT = Number(process.env.E2E_PORT) || 3998;

export default defineConfig({
  testDir: './e2e',
  // e2e/audit contains stale AS-IS capture specs that assert previously-fixed
  // broken behavior (PATCH hangs, empty user list). Excluded from the go-live gate.
  testIgnore: ['**/audit/**'],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.E2E_CHANNEL || 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `"${tsxBin}" scripts/startE2eServer.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
