import { test } from '@playwright/test';
import { DEMO_EMAIL } from './helpers';

test('debug bad login', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('you@company.com').fill(DEMO_EMAIL);
  await page.getByPlaceholder('Enter your password').fill('definitely-wrong-password');
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForTimeout(5000);
  const text = await page.locator('body').innerText();
  console.log('BODY>>>' + text.slice(0, 800) + '<<<');
});
