import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

export const AUDIT_PW = 'Audit#1234x';
export const AUDIT_SA = { email: 'audit.superadmin@4core.test', password: AUDIT_PW };
export const SUPER_ADMIN = { email: process.env.E2E_EMAIL || 'peteslimmy@gmail.com', password: process.env.E2E_PASSWORD || process.env.DEMO_PASSWORD || 'password123' };
export const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3998';

export interface ReqInfo {
  method: string;
  url: string;
  startedAt: number;
  finished?: boolean;
  status?: number;
  failed?: string;
  durationMs?: number;
}

export interface Trace {
  consoleErrors: string[];
  pageErrors: string[];
  requests: ReqInfo[];
  apiFailures: { method: string; url: string; status: number }[];
}

/** Wraps a page with console/network/response recording. */
export function attachAudit(page: Page): Trace {
  const t: Trace = { consoleErrors: [], pageErrors: [], requests: [], apiFailures: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') t.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    t.pageErrors.push(err.message + (err.stack ? `\n${err.stack}` : ''));
  });
  page.on('request', (req) => {
    const m = req.method();
    if (m === 'GET' || m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE') {
      t.requests.push({ method: m, url: req.url(), startedAt: Date.now() });
    }
  });
  const finish = (req: any, failed?: string, status?: number) => {
    const r = t.requests.find((x) => x.method === req.method() && x.url === req.url() && !x.finished);
    if (r) {
      r.finished = true;
      r.failed = failed;
      r.status = status;
      r.durationMs = Date.now() - r.startedAt;
    }
  };
  page.on('response', (res) => {
    finish(res.request(), undefined, res.status());
    if (res.url().startsWith(BASE) && res.status() >= 400) {
      t.apiFailures.push({ method: res.request().method(), url: res.url(), status: res.status() });
    }
  });
  page.on('requestfailed', (req) => {
    finish(req, req.failure()?.errorText || 'unknown');
  });
  return t;
}

/** Requests that started a mutation/GET to the API and never got a response (hung). */
export function hangs(t: Trace, filter: (u: string) => boolean): ReqInfo[] {
  return t.requests.filter((r) => filter(r.url) && !r.finished);
}

export async function uiLogin(page: Page, email = AUDIT_SA.email, password = AUDIT_PW) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page
    .getByRole('button', { name: /Skip tour/i })
    .click({ timeout: 3000 })
    .catch(() => {});
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 20_000 });
}

/** In-page authorized fetch that mirrors src/lib/api authorizedFetch (CSRF double-submit). */
export async function pageApi<T = any>(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; text: string; json: any }> {
  return page.evaluate(async ({ method, path, body }) => {
    const getCookie = (n: string) => {
      const p = n + '=';
      for (const part of document.cookie.split('; ')) {
        if (part.startsWith(p)) return decodeURIComponent(part.slice(p.length));
      }
      return null;
    };
    const headers: Record<string, string> = {};
    const csrf = getCookie('4c_csrf');
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    return { status: res.status, text, json };
  }, { method, path, body });
}

export const auditTest = base.extend<{ audit: Trace }>({
  audit: [async ({ page }, use) => {
    const t = attachAudit(page);
    await use(t);
  }, { auto: true }],
});

export function summarize(t: Trace): string[] {
  return t.apiFailures.map((f) => `${f.method} ${f.url.replace(BASE, '')} -> ${f.status}`);
}