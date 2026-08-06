import { test, expect } from '@playwright/test';
import { login, DEMO_EMAIL } from './helpers';

test.describe('Authentication', () => {
  test('renders the login page when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '4CoreFinSupport' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('rejects invalid credentials with an error', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('you@company.com').fill(DEMO_EMAIL);
    await page.getByPlaceholder('Enter your password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText(/invalid|Incorrect|wrong|error/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Authenticated session', () => {
  test('logs in and reaches the workspace', async ({ page }) => {
    await login(page);
    // Super Admin default tab is tickets — the workspace header should appear.
    await expect(page.getByText('4CoreFinSupport v1.0')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('logout returns to the login page', async ({ page }) => {
    await login(page);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Sarah|Adaobi|Okafor|Okeke/i }).first().click();
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page.getByRole('heading', { name: '4CoreFinSupport' })).toBeVisible({ timeout: 15_000 });
  });
});
