import { getSettings } from './settingsService';
import { sendEmail } from './emailService';

export type DispatchStatus = 'SENT' | 'FAILED' | 'QUEUED';

export interface DispatchResult {
  status: DispatchStatus;
  error?: string;
}

/** Strip HTML tags so webhook payloads receive plain text. */
function stripHtml(html: string): string {
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

/**
 * Actually dispatch a major-incident advisory over a configured channel.
 *
 * Slack/Teams webhook URLs come from the `notifications.slack_webhook_url` and
 * `notifications.teams_webhook_url` system settings; email uses the existing
 * SMTP transport. A target that cannot be reached is never marked "SENT":
 * results are SENT (delivered), FAILED (attempted but errored), or QUEUED
 * (no destination configured / unknown channel) so the UI can offer a retry.
 */
export async function dispatchNotification(channel: string, recipient: string, subject: string, content: string): Promise<DispatchResult> {
  const s = await getSettings(['notifications.slack_webhook_url', 'notifications.teams_webhook_url']);
  try {
    if (/slack/i.test(channel)) {
      const url = s['notifications.slack_webhook_url'];
      if (!url) return { status: 'QUEUED', error: 'Slack webhook URL not configured' };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
      });
      if (!res.ok) {
        return { status: 'FAILED', error: `Slack webhook responded ${res.status}` };
      }
      return { status: 'SENT' };
    }

    if (/teams/i.test(channel)) {
      const url = s['notifications.teams_webhook_url'];
      if (!url) return { status: 'QUEUED', error: 'Teams webhook URL not configured' };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
      });
      if (!res.ok) {
        return { status: 'FAILED', error: `Teams webhook responded ${res.status}` };
      }
      return { status: 'SENT' };
    }

    if (/email/i.test(channel) && recipient) {
      const result = await sendEmail({ to: recipient, subject, html: content, text: stripHtml(content) });
      if (!result.ok) {
        if (/not configured/i.test(result.error || '')) {
          return { status: 'QUEUED', error: 'SMTP not configured' };
        }
        return { status: 'FAILED', error: result.error };
      }
      return { status: 'SENT' };
    }

    return { status: 'QUEUED', error: `Unsupported dispatch channel: ${channel}` };
  } catch (e: any) {
    return { status: 'FAILED', error: e?.message || 'Dispatch failed' };
  }
}