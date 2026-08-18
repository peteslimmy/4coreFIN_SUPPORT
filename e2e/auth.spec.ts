import { test, expect } from '@playwright/test';
import { login, DEMO_EMAIL } from './helpers';

test.describe('Public landing page', () => {
  test('renders the split landing/login page at /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/4CoreFin/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();
  });

  test('exposes the sign-in form directly at /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('textbox', { name: /Email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });
});

test.describe('Authentication', () => {
  test('renders the login page when unauthenticated', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('rejects invalid credentials with an error', async ({ page }) => {
    await page.goto('/auth/login');
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
    const nameSpan = page.locator('span[title]').first();
    const displayName = (await nameSpan.getAttribute('title')) || '';
    await page.getByRole('button', { name: new RegExp(displayName) }).first().click();
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible({ timeout: 15_000 });
  });
});
