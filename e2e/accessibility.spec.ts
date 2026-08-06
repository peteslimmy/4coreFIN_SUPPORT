import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login } from './helpers';

test.describe('Accessibility (axe-core)', () => {
  test('login page has no critical or serious violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: '4CoreFinSupport' }).waitFor();
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
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter(v => ['critical', 'serious'].includes(v.impact || ''))
    ).toEqual([]);
  });
});
