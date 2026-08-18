import { sendEmail } from './emailService';

/**
 * Best-effort operational email helper used for SLA alerts, comment replies,
 * mentions, and ticket watcher digests. Emails must never block the request
 * path, so callers fire them and forget; failures are logged, and an
 * unconfigured SMTP server is silently skipped (matching dispatchService).
 */

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function baseAppUrl(): string {
  const fromEnv =
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:5173';
  return fromEnv.replace(/\/+$/, '');
}

/** Where users land in the app; the workspace is tab-driven so the root is the
 *  only stable target. */
export function appHomeUrl(): string {
  return `${baseAppUrl()}/`;
}

export async function notifyByEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
  try {
    const result = await sendEmail({ to, subject, html, text: text ?? stripTags(html) });
    if (!result.ok && !/not configured/i.test(result.error || '')) {
      console.warn(`[notify] email to ${to} failed: ${result.error}`);
    }
  } catch (e: any) {
    console.warn(`[notify] email to ${to} threw: ${e?.message || e}`);
  }
}
