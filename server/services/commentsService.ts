import { listUsersPublic, getScopedComment } from '../repository';
import { appHomeUrl } from './notifyEmails';
import { escapeHtml } from '../lib/htmlSanitize';

export { escapeHtml } from '../lib/htmlSanitize';

/** Resolve @Name tokens in a comment to matching user emails (best-effort). */
export function mentionEmails(message: string, users: Array<{ name?: string; email: string }>): string[] {
  const tokens: string[] = [];
  const re = /@([A-Za-z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.'-]*)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) tokens.push(m[1].trim());
  const out: string[] = [];
  for (const token of tokens) {
    const tl = token.toLowerCase();
    const hit = users.find((u) => {
      const n = (u.name || '').toLowerCase();
      return n === tl || n.startsWith(tl + ' ') || n.split(/\s+/)[0] === tl;
    });
    if (hit && !out.includes(hit.email)) out.push(hit.email);
  }
  return out;
}

/**
 * Resolve the set of email recipients who should be notified about a comment.
 * Recipients include: the parent comment's author, @mention targets, and any
 * explicitly specified recipients. The user list is fetched at most once per
 * call and shared by both parent-author resolution and @mention expansion.
 */
export async function resolveCommentRecipients(opts: {
  message: string;
  parentCommentId?: string;
  notifyRecipients?: string[];
  currentUserEmail: string;
  user: { role: string; bu?: string; tenantId?: string };
}): Promise<Set<string>> {
  let usersCache: Awaited<ReturnType<typeof listUsersPublic>> | null = null;
  const resolveUsers = async () => {
    if (usersCache === null) {
      try {
        usersCache = await listUsersPublic();
      } catch {
        usersCache = []; // mention resolution must never block delivery
      }
    }
    return usersCache;
  };

  const recipients = new Set<string>();

  if (opts.parentCommentId) {
    const parent = await getScopedComment(opts.parentCommentId, opts.user as any);
    if (parent?.authorEmail) {
      recipients.add(parent.authorEmail);
    } else if (parent?.author) {
      const byName = (await resolveUsers()).find((u) => u.name?.toLowerCase() === String(parent.author).toLowerCase());
      if (byName?.email) recipients.add(byName.email);
    }
  }

  for (const email of mentionEmails(opts.message, await resolveUsers())) recipients.add(email);
  for (const r of Array.isArray(opts.notifyRecipients) ? opts.notifyRecipients : []) {
    if (typeof r === 'string' && r.trim()) recipients.add(r.trim());
  }

  recipients.delete(opts.currentUserEmail);
  return recipients;
}

/**
 * Build the HTML email body for a comment notification.
 */
export function buildCommentEmailHtml(opts: {
  ticketId: string;
  author: string;
  messageSnippet: string;
}): string {
  return `<h3>New comment on ${opts.ticketId}</h3><p><strong>From:</strong> ${escapeHtml(opts.author)}</p><blockquote style="border-left:3px solid #e2e8f0;padding-left:12px;color:#334155;">${escapeHtml(opts.messageSnippet)}</blockquote><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`;
}

/**
 * Build the plain-text body for a comment notification.
 */
export function buildCommentEmailText(opts: {
  ticketId: string;
  author: string;
  messageSnippet: string;
}): string {
  return `New comment from ${opts.author} on ${opts.ticketId}: ${opts.messageSnippet}`;
}

/**
 * Notify all recipients about a new comment via email.
 * This function runs asynchronously and should not block the response.
 */
export async function notifyCommentRecipients(opts: {
  recipients: Set<string>;
  commentId: string;
  ticketId: string;
  author: string;
  snippet: string;
  currentUserEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const { insertNotification } = await import('../repository');
  const { notifyByEmail } = await import('./notifyEmails');

  let idx = 0;
  await Promise.all(
    Array.from(opts.recipients).map(async (recipient) => {
      if (recipient.toLowerCase() === opts.currentUserEmail.toLowerCase()) return;
      const slot = idx++;
      try {
        await insertNotification({
          id: `wn-cmt-${opts.commentId}-${slot}`,
          timestamp: new Date().toISOString(),
          ticketId: opts.ticketId,
          message: `New comment from ${opts.author} on ${opts.ticketId}: "${opts.snippet}"`,
          recipient,
          seen: false,
        });
      } catch {
        // a notifications hiccup must not fail the comment write
      }
      void notifyByEmail(recipient, opts.subject, opts.html, opts.text);
    })
  );
}
