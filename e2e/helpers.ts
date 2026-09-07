import 'dotenv/config';
import https from 'https';
import type { Page } from '@playwright/test';
import { USERS, E2E_PASSWORD } from './identity';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

/**
 * Run raw SQL against the project's database via the Supabase Management API.
 * Used by spec-level assertions that need cross-cutting truth (e.g. the
 * archive regression asserting MERGE_CLOSE wrote status='CLOSED' + is_deleted).
 */
export async function managerSql(
  query: string
): Promise<{ status?: number; data?: unknown; raw?: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => {
          try {
            resolve({ status: r.statusCode, data: JSON.parse(b) });
          } catch {
            resolve({ status: r.statusCode, raw: b });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export const DEMO_EMAIL = process.env.E2E_EMAIL || USERS.superadmin;
export const DEMO_PASSWORD = process.env.E2E_PASSWORD || E2E_PASSWORD;

export async function login(page: Page, email = DEMO_EMAIL, password = DEMO_PASSWORD) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForURL(/\/app\/|\/(tickets|dashboard|reference_data|customer_portal|payment_partner_portal|admin_settings)/, { timeout: 15_000 }).catch(() => {});
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  // Dismiss the first-run onboarding tour if it appears.
  await page.getByRole('button', { name: /Skip tour/i }).click({ timeout: 3000 }).catch(() => {});
}

/** Log in as one of the run-scoped E2E users (see identity.ts). */
export async function loginAs(page: Page, key: keyof typeof USERS) {
  await login(page, USERS[key]);
}

/**
 * Authenticated request against the app API reusing the browser session.
 * Adds the double-submit CSRF header for state-changing verbs matching the
 * 4c_csrf cookie (mirrors the SPA's own requests).
 */
export async function api(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === '4c_csrf')?.value || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET') headers['x-csrf-token'] = csrf;
  return page.request.fetch(path, { method, headers, data: body });
}

/** Read the 4c_session cookie value (JWT) so API assertions can attach it explicitly. */
export async function sessionToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === '4c_session')?.value || '';
}
