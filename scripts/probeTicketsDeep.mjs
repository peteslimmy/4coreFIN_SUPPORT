// TEMP diagnostic: open the ticket workspace AND click into a ticket as SUPER_ADMIN
// (same role/tenant as the real admin user who reports the Workspace Error). Captures
// the exact boundary error + pageerrors with stacks. Run: node scripts/probeTicketsDeep.mjs
import { config } from 'dotenv';
config({ override: true });
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3001';
const EMAIL = process.env.PROBE_EMAIL || 'e2e.superadmin@e2efixed.test';
const PASSWORD = (process.env.E2E_PASSWORD || 'E2e!Test2025Str0ng').trim();

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => {
  const m = e.message || '';
  if (!/WebSocket|vite/i.test(m)) pageErrors.push(`[pageerror] ${m.slice(0, 400)}\n${(e.stack || '').slice(0, 1200)}`);
});
page.on('console', (m) => {
  const t = m.text() || '';
  if (/WebSocket|vite|Download the React DevTools/i.test(t)) return;
  consoleErrors.push(`[${m.type()}] ${t.slice(0, 900)}`);
  if (m.type() === 'error' && /\[Workspace\] Error/i.test(t)) {
    const args = m.args();
    Promise.all(args.map((a, i) => a.evaluate((o, idx) => {
      if (o instanceof Error) return `ARG${idx}: ERROR ${o.message}\nSTACK:\n${o.stack || ''}`;
      if (typeof o === 'string') return `ARG${idx}: ${o}`;
      try { return `ARG${idx}: ${JSON.stringify(o)}`; } catch { return `ARG${idx}: ${String(o)}`; }
    }, i))).then(vals => consoleErrors.push(`[console|args] ${vals.join('\n=== args ===\n')}`));
  }
});

await page.goto(`${BASE}/auth/login`);
await page.getByPlaceholder('you@company.com').fill(EMAIL);
await page.getByPlaceholder('Enter your password').fill(PASSWORD);
await page.getByRole('button', { name: /Sign In/i }).click();
await page.waitForURL(/\/app\//, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /Skip tour/i }).click({ timeout: 2500 }).catch(() => {});
console.log(`LOGIN: ${page.url()} (ok: ${page.url().includes('/app/')})`);

// ── list ─────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/app/tickets`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
if (await page.getByText('Something went wrong loading this page').count() > 0) {
  const d = page.locator('details p.font-mono');
  console.log('BOUNDARY ON LIST:', (await d.count() > 0) ? await d.first().textContent() : '(no detail)');
  await browser.close();
  console.log('PROBE DONE');
  process.exit(0);
}

const ticketsVisible = await page.getByRole('button', { name: /View ticket/i }).count();
console.log(`TICKET CARDS VISIBLE: ${ticketsVisible}`);

// ── open the first ticket ────────────────────────────────────────────────
if (ticketsVisible > 0) {
  const first = page.getByRole('button', { name: /View ticket/i }).first();
  const firstLabel = await first.getAttribute('aria-label');
  console.log(`OPENING: ${firstLabel}`);
  await first.click();
  await page.waitForTimeout(3500);

  if (await page.getByText('Something went wrong loading this page').count() > 0) {
    const d = page.locator('details p.font-mono');
    console.log('BOUNDARY AFTER OPENING TICKET:', (await d.count() > 0) ? await d.first().textContent() : '(no detail)');
  } else {
    console.log('TICKET DETAIL OK — trying tabs: investigation, intelligence, audit…');
    const tabs = ['Investigation', 'Intelligence', 'Watchers', 'Audit'];
    for (const t of tabs) {
      const tab = page.getByRole('button', { name: new RegExp(t, 'i') }).first();
      await tab.click({ timeout: 3000 }).then(async () => {
        await page.waitForTimeout(2000);
        if (await page.getByText('Something went wrong loading this page').count() > 0) {
          const d = page.locator('details p.font-mono');
          console.log(`BOUNDARY ON TAB ${t}:`, (await d.count() > 0) ? await d.first().textContent() : '(no detail)');
        }
      }).catch(() => {});
    }
  }
}

for (const e of [...new Set(pageErrors)].slice(0, 10)) console.log('PAGEERROR>>>', e);
for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('CONSOLEERR>>>', e);
await browser.close();
console.log('PROBE DONE');