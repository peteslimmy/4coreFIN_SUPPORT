import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BREAKPOINTS = [
  { name: 'iphone-se', width: 320, height: 568 },
  { name: 'iphone-8', width: 375, height: 667 },
  { name: 'pixel', width: 390, height: 844 },
  { name: 'pixel-xl', width: 414, height: 896 },
  { name: 'ipad', width: 768, height: 1024 },
  { name: 'ipad-land', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];

function noHorizontalOverflow(page: any) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

test.describe('SEC-59 Responsive — login', () => {
  for (const bp of BREAKPOINTS) {
    test(`no horizontal overflow at ${bp.width}×${bp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/auth/login');
      await page.getByRole('heading', { name: /Sign in/i }).waitFor({ timeout: 15_000 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      const inputs = page.getByRole('textbox');
      expect(await inputs.count()).toBeGreaterThan(0);
      const email = page.getByPlaceholder('you@company.com');
      await email.click();
      await expect(email).toBeVisible();
    });
  }
});

test.describe('SEC-59 Responsive — ticket workspace', () => {
  test('no horizontal overflow at any breakpoint (single session, iterate viewports)', async ({ page }) => {
    await login(page);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 20_000 });
    for (const bp of BREAKPOINTS) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.waitForTimeout(600);
      expect(
        await noHorizontalOverflow(page),
        `overflow at ${bp.width}×${bp.height}`
      ).toBe(true);
    }
  });
});

test.describe('SEC-61 Console errors — login → workspace → logout', () => {
  test('no app-level unhandled console errors / pageerrors in the core flow', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()}`));

    await login(page);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    const nameSpan = page.locator('span[title]').first();
    const displayName = (await nameSpan.getAttribute('title')) || '';
    await page.getByRole('button', { name: new RegExp(displayName) }).first().click();
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible({ timeout: 15_000 });

    // Dev-infra / expected-teardown noise is excluded (Vite HMR WebSocket, SSE + branding
    // reconnect after the session cookie is destroyed, 401/auth-required sync after logout,
    // and Supabase storage signed-URL image loads aborted by page navigation).
    const appErrors = errors.filter((e) =>
      !/websocket|vite|24678|ws:\/\//i.test(e) &&
      !/api\/events|api\/public\/branding|WebSocket closed|supabase\.co\/storage/i.test(e) &&
      !/authentication required|401|unauthorized/i.test(e)
    );
    expect(appErrors).toEqual([]);
  });
});