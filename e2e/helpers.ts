import type { Page } from '@playwright/test';

export const DEMO_EMAIL = process.env.E2E_EMAIL || 'peteslimmy@gmail.com';
export const DEMO_PASSWORD = process.env.E2E_PASSWORD || process.env.DEMO_PASSWORD || 'password123';

export async function login(page: Page, email = DEMO_EMAIL, password = DEMO_PASSWORD) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  // Dismiss the first-run onboarding tour if it appears.
  await page.getByRole('button', { name: /Skip tour/i }).click({ timeout: 3000 }).catch(() => {});
}
