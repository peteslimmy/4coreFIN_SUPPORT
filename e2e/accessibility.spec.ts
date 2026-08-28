import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login } from './helpers';

test.describe('Accessibility (axe-core)', () => {
  test('public landing/login page has no critical or serious violations', async ({ page }) => {
    // "/" renders the split landing/login screen directly (auth.spec asserts
    // this too), so this is the public surface we validate with axe.
    await page.goto('/');
    await page.getByRole('heading', { name: /Sign in/i }).waitFor();
    // Let the page-enter fade finish so axe reads final colors, not
    // mid-transition blends (same rationale as the workspace test below).
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter(v => ['critical', 'serious'].includes(v.impact || ''))
    ).toEqual([]);
  });

  test('login page has no critical or serious violations', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('heading', { name: /Sign in/i }).waitFor();
    // Same animation-settle rationale as above.
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter(v => ['critical', 'serious'].includes(v.impact || ''))
    ).toEqual([]);
  });

  test('ticket workspace has no critical or serious violations', async ({ page }) => {
    await login(page);
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 20_000 });
    // Wait for the tab entrance animation to settle so axe reads final colors
    // (mid-fade opacity otherwise blends text toward the background).
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter(v => ['critical', 'serious'].includes(v.impact || ''))
    ).toEqual([]);
  });
});
