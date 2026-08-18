import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3998/auth/login');
  console.log('Page URL:', page.url());
  
  await page.getByPlaceholder('you@company.com').fill('e2e.possap@e2efixed.e2e');
  await page.getByPlaceholder('Enter your password').fill('E2e!fixed123');
  
  // Listen for XHR responses
  page.on('response', async (response) => {
    if (response.url().includes('/api/auth/login')) {
      const status = response.status();
      const body = await response.text();
      console.log('Login XHR response status:', status);
      console.log('Login XHR body:', body.slice(0, 500));
    }
  });
  
  console.log('Clicking Sign In...');
  await page.getByRole('button', { name: /Sign In/i }).click();
  
  // Wait for the page to stabilize
  await page.waitForTimeout(3000);
  
  console.log('Page URL after login:', page.url());
  console.log('isAuthenticated (has #main-content):', await page.locator('#main-content').count());
  
  const bodyText = await page.locator('body').innerText();
  console.log('Page text (first 500 chars):', bodyText.slice(0, 500));
  
  // Check for error messages
  const errorText = await page.locator('[role="alert"]').innerText().catch(() => 'none');
  console.log('Alert text:', errorText);
  
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });