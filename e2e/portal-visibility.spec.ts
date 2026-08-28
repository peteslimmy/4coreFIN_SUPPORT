/**
 * End-to-end portal-visibility + ticket-lifecycle regression suite.
 *
 * Covers the original outage (complaints invisible to Super Admin / Executive /
 * Payment Partner) plus lifecycle, tenant isolation, RBAC and the archive-close
 * regression (a non-terminal ticket must close via the state machine's
 * MERGE_CLOSE path and leave normal lists).
 *
 * Runs against the configured Supabase project. E2E users + tickets are
 * provisioned by global-setup and hard-deleted by global-teardown.
 */
import { test, expect, type Page } from '@playwright/test';
import { loginAs, api, managerSql } from './helpers';
import { MARKER, customerEmail } from './identity';

test.describe.configure({ mode: 'serial' });

// Provisioning here (not just global-setup) keeps this suite runnable
// standalone. Cleanup is owned exclusively by global-teardown — an afterAll
// cleanup here deleted the E2E users out from under every spec that runs
// later alphabetically (e.g. responsive-console).

const state: { ticketA: string; ticketB: string; ticketC: string } = {
  ticketA: '',
  ticketB: '',
  ticketC: '',
};

const CUSTOMER_A = 'E2E Alice';
const CUSTOMER_B = 'E2E Bob';

async function appReady(page: Page) {
  await page.waitForSelector('#main-content', { timeout: 20_000 });
  await page.waitForTimeout(800);
}

/** SUPER_ADMIN lands on the Reference Data tab by default; go to the workspace. */
async function openTicketWorkspace(page: Page) {
  await page.getByRole('button', { name: /Ticket Workspace/i }).click();
  await page.getByRole('textbox', { name: 'Search tickets' }).waitFor({ timeout: 15_000 });
}

function ticketCard(page: Page, customer: string) {
  return page.locator(`button[title*="${customer}"]`).first();
}

async function createTicketViaWorkspace(
  page: Page,
  opts: { customer: string; partner: string; seq: number }
) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByLabel('Customer Name').fill(opts.customer);
  await page.getByLabel('Customer Email').fill(customerEmail(opts.seq));
  await page.getByLabel('Partner').selectOption(opts.partner);
  await page.getByLabel('Issue Category').selectOption('Failed Payment');
  await page.getByLabel('Priority').selectOption('HIGH');
  await page.getByLabel('Transaction ID').fill(`TXN-${opts.seq}-${Date.now()}`);
  await page.getByLabel('Description').fill(`${MARKER} ${opts.customer} - failed payment`);

  await page.getByRole('button', { name: 'Create Ticket', exact: true }).click();

  const card = ticketCard(page, opts.customer);
  await expect(card).toBeVisible({ timeout: 20_000 });
  const id = (await card.locator('.font-numeric').first().innerText()).trim();
  await card.click();
  await expect(page.locator('#main-content').getByText(MARKER).first()).toBeVisible({ timeout: 15_000 });
  return id;
}

async function searchAndOpen(page: Page, customer: string, id: string) {
  await page.getByRole('textbox', { name: 'Search tickets' }).fill(customer);
  const card = ticketCard(page, customer);
  await expect(card).toBeVisible({ timeout: 15_000 });
  const cardId = (await card.locator('.font-numeric').first().innerText()).trim();
  expect(cardId).toBe(id);
  await card.click();
}

async function ticketStatus(page: Page, id: string): Promise<string | null> {
  const res = await api(page, 'GET', `/api/tickets/${encodeURIComponent(id)}`);
  if (res.status() !== 200) return null;
  const t = (await res.json()) as { status?: string };
  return t.status ?? null;
}

test('BU Support (POSSAP) files two complaints via the workspace UI', async ({ page }) => {
  const { RUN_ID, E2E_PASSWORD, USERS } = await import('./identity');
  console.log('[spec] RUN_ID', RUN_ID, 'E2E_PASSWORD', E2E_PASSWORD, 'USERS.possap', USERS.possap);
  await loginAs(page, 'possap');
  await appReady(page);

  state.ticketA = await createTicketViaWorkspace(page, { customer: CUSTOMER_A, partner: 'PARKWAY', seq: 1 });
  state.ticketB = await createTicketViaWorkspace(page, { customer: CUSTOMER_B, partner: 'MONNIEPOINT', seq: 2 });

  expect(state.ticketA).toMatch(/^POS-/);
  expect(state.ticketB).toMatch(/^POS-/);
});

test('SUPER_ADMIN sees both complaints in Ticket Workspace', async ({ page }) => {
  await loginAs(page, 'superadmin');
  await appReady(page);
  await openTicketWorkspace(page);

  await searchAndOpen(page, CUSTOMER_A, state.ticketA);
  await searchAndOpen(page, CUSTOMER_B, state.ticketB);
});

test('EXECUTIVE dashboard renders and scoped data includes both complaints', async ({ page }) => {
  await loginAs(page, 'executive');
  await appReady(page);
  await expect(page.getByRole('heading', { name: /Executive Performance Desk/i })).toBeVisible({ timeout: 15_000 });

  for (const id of [state.ticketA, state.ticketB]) {
    const res = await api(page, 'GET', `/api/tickets?search=${encodeURIComponent(id)}&limit=100`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { tickets?: Array<{ id: string }> };
    const tickets = Array.isArray(body) ? body : (body.tickets ?? []);
    expect(tickets.some((t) => t.id === id)).toBe(true);
  }
});

test('Payment Partner portal is scoped to PARKWAY only', async ({ page }) => {
  await loginAs(page, 'partner');
  await appReady(page);

  await expect(page.getByRole('heading', { name: /Payment Partner Portal/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(state.ticketA, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(state.ticketB, { exact: true })).toHaveCount(0);
});

test('Tenant isolation: VREG BU never sees a POSSAP complaint', async ({ page }) => {
  await loginAs(page, 'vreg');
  await appReady(page);

  await page.getByRole('textbox', { name: 'Search tickets' }).fill(state.ticketA);
  await expect(ticketCard(page, CUSTOMER_A)).toHaveCount(0);

  const res = await api(page, 'GET', `/api/tickets?search=${encodeURIComponent(state.ticketA)}&limit=100`);
  const body = (await res.json()) as { tickets?: Array<{ id: string }> };
  const tickets = Array.isArray(body) ? body : (body.tickets ?? []);
  expect(tickets.some((t) => t.id === state.ticketA)).toBe(false);
});

test('Payment Partner lifecycle: Begin Investigation + Submit RCA → RESOLVED', async ({ page }) => {
  await loginAs(page, 'partner');
  await appReady(page);

  const row = page
    .getByText(state.ticketA, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"p-5")][1]');

  await row.getByRole('button', { name: /Begin Investigation/i }).click();
  await expect(row.getByRole('button', { name: /Submit RCA/i })).toBeVisible({ timeout: 15_000 });

  await row.getByRole('button', { name: /Submit RCA/i }).click();
  await page.getByPlaceholder('What caused this issue?').fill('E2E root cause');
  await page.getByPlaceholder('What was done to fix it?').fill('E2E corrective action');
  await page.getByRole('button', { name: 'Submit & Resolve Ticket', exact: true }).click();

  await expect
    .poll(async () => ticketStatus(page, state.ticketA), { timeout: 20_000 })
    .toBe('RESOLVED');
});

test('BU Support closes the resolved complaint with feedback', async ({ page }) => {
  await loginAs(page, 'possap');
  await appReady(page);

  await searchAndOpen(page, CUSTOMER_A, state.ticketA);
  await expect(page.getByText(/Resolution Validation Required/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: 'Accept & Close', exact: true }).click();

  await expect
    .poll(async () => ticketStatus(page, state.ticketA), { timeout: 20_000 })
    .toBe('CLOSED');
});

test('Archive regression: non-terminal ASSIGNED ticket closes via MERGE_CLOSE and leaves lists', async ({ page }) => {
  await loginAs(page, 'superadmin');
  await appReady(page);
  await openTicketWorkspace(page);

  await searchAndOpen(page, CUSTOMER_B, state.ticketB);

  const archiveBtn = page.getByRole('button', { name: 'Archive', exact: true });
  await archiveBtn.click();
  await page.waitForTimeout(300);
  await archiveBtn.click();

  // Server-side truth: the state machine's MERGE_CLOSE path must have applied.
  await expect
    .poll(
      async () => {
        const res = await managerSql(`SELECT status, is_deleted FROM tickets WHERE id = '${state.ticketB}';`);
        const rows = (res.data as Array<{ status?: string; is_deleted?: boolean }>) ?? [];
        if (!rows.length) return null;
        return `${rows[0].status}|${rows[0].is_deleted}`;
      },
      { timeout: 20_000 }
    )
    .toBe('CLOSED|true');

  // Reload the workspace: the archived ticket must be gone from normal lists.
  await page.reload();
  await appReady(page);
  await page.getByRole('textbox', { name: 'Search tickets' }).fill(state.ticketB);
  await expect(ticketCard(page, CUSTOMER_B)).toHaveCount(0);
});

test('RBAC: PARTNER cannot write admin config/settings; SUPER_ADMIN sees the Customization tab', async ({ page }) => {
  await loginAs(page, 'partner');
  await appReady(page);
  await expect(page.getByRole('button', { name: /Customization/i })).toHaveCount(0);

  const rolesRes = await api(page, 'PUT', '/api/config/roles', {});
  expect(rolesRes.status()).toBe(403);
  const settingsRes = await api(page, 'PUT', '/api/admin/settings/some-key', { value: 'x' });
  expect(settingsRes.status()).toBe(403);
  const usersRes = await api(page, 'GET', '/api/users');
  expect(usersRes.status()).toBe(403);

  await loginAs(page, 'superadmin');
  await appReady(page);
  await expect(page.getByRole('button', { name: /Customization/i }).first()).toBeVisible({ timeout: 15_000 });
});

test("'CUSTOMER'-submitted complaint accepted by live API and visible to SUPER_ADMIN", async ({ page }) => {
  await loginAs(page, 'possap');
  await appReady(page);

  const res = await api(page, 'POST', '/api/tickets', {
    customerName: 'E2E Carol',
    customerEmail: customerEmail(3),
    businessUnit: 'POSSAP',
    partner: 'PARKWAY',
    category: 'Failed Payment',
    priority: 'HIGH',
    description: `${MARKER} E2E Carol - customer-submitted`,
    submittedBy: 'CUSTOMER',
    submittedByName: 'E2E Carol',
  });
  expect(res.status()).toBe(201);
  const created = (await res.json()) as { id?: string };
  expect(created.id).toBeTruthy();
  state.ticketC = String(created.id);

  await loginAs(page, 'superadmin');
  await appReady(page);
  const listRes = await api(page, 'GET', `/api/tickets?search=${encodeURIComponent(state.ticketC)}&limit=100`);
  const body = (await listRes.json()) as { tickets?: Array<{ id: string }> };
  const tickets = Array.isArray(body) ? body : (body.tickets ?? []);
  expect(tickets.some((t) => t.id === state.ticketC)).toBe(true);
});

test('staff-logged complaint records the officer and keys the customer to the entered email', async ({ page }) => {
  await loginAs(page, 'possap');
  await appReady(page);

  const res = await api(page, 'POST', '/api/tickets', {
    customerName: 'Chinedu Okonkwo',
    customerEmail: customerEmail(4),
    customerPhone: '+2340000000000',
    businessUnit: 'POSSAP',
    partner: 'PARKWAY',
    category: 'Failed Payment',
    priority: 'HIGH',
    description: `${MARKER} Chinedu Okonkwo - logged on behalf of customer`,
  });
  expect(res.status()).toBe(201);
  const created = (await res.json()) as { id?: string; submittedBy?: string; submittedByName?: string };
  expect(created.id).toBeTruthy();
  expect(created.submittedBy).toBe('BU_SUPPORT');
  expect(created.submittedByName).toBe('E2E POSSAP Support');

  const custRes = await api(page, 'GET', '/api/customers');
  expect(custRes.status()).toBe(200);
  const customers = (await custRes.json()) as Array<{ email: string; firstName?: string; lastName?: string }>;
  const match = customers.find((c) => c.email === customerEmail(4));
  expect(match).toBeTruthy();
  expect(`${match?.firstName} ${match?.lastName}`.trim()).toBe('Chinedu Okonkwo');

  const detail = await api(page, 'GET', `/api/tickets/${encodeURIComponent(String(created.id))}`);
  expect(detail.status()).toBe(200);
  const t = (await detail.json()) as { submittedByName?: string };
  expect(t.submittedByName).toBe('E2E POSSAP Support');
});
