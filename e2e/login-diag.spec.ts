import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';
import { provisionTestUsers } from './provision';

test.beforeAll(async () => {
  await provisionTestUsers();
});

test('diagnose: see what login+appReady produces', async ({ page }) => {
  await loginAs(page, 'possap');
  
  const url = page.url();
  const hasMain = await page.locator('#main-content').count();
  const bodyText = await page.locator('body').innerText();
  const html = await page.innerHTML('html');
  
  console.log('URL after login:', url);
  console.log('#main-content count:', hasMain);
  console.log('Body text (first 800):', bodyText.slice(0, 800));
  console.log('HTML length:', html.length);
  console.log('HTML (first 2000):', html.slice(0, 2000));
  
  // Try waiting longer
  await page.waitForTimeout(3000);
  const hasMainAfterWait = await page.locator('#main-content').count();
  console.log('#main-content count after 3s wait:', hasMainAfterWait);
  
  if (hasMainAfterWait > 0) {
    console.log('#main-content is visible:', await page.locator('#main-content').isVisible());
    console.log('#main-content HTML:', await page.locator('#main-content').innerHTML().catch(() => 'FAILED'));
  }
});