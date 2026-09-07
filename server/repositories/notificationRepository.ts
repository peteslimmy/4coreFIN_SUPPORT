import { supabase } from '../supabase';
import { type AuthUser } from '../compliance';
import { broadcast } from '../broadcast';
import { escapeLike } from '../lib/escapeLike';
import { tenantScope, ticketTenantId } from './shared';

// ─── Notifications ─────────────────────────────────────────────────────

export async function listNotifications(recipient?: string, user?: AuthUser, limit = 200) {
  let query = supabase.from('watcher_notifications').select('*').order('timestamp', { ascending: false });
  if (recipient) {
    query = query.ilike('recipient', escapeLike(recipient));
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  // The notification feed is a bounded "latest N" view (DB-13): the bell and
  // notifications page render the most recent items, so an unbounded read of a
  // fast-growing insert pattern must be capped.
  query = query.limit(limit);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    ticketId: r.ticket_id,
    message: r.message,
    recipient: r.recipient,
    seen: !!r.seen,
  }));
}

export async function insertNotification(n: {
  id: string;
  timestamp: string;
  ticketId: string;
  message: string;
  recipient: string;
  seen: boolean;
}) {
  const tenantId = await ticketTenantId(n.ticketId);
  const { error } = await supabase.from('watcher_notifications').insert({
    id: n.id,
    timestamp: n.timestamp,
    ticket_id: n.ticketId,
    tenant_id: tenantId,
    message: n.message,
    recipient: n.recipient,
    seen: n.seen,
  });
  if (error) throw new Error(`insertNotification failed: ${error.message}`);
  broadcast('notification_created', n, tenantId);
}

export async function markNotificationRead(id: string, user: AuthUser) {
  const tenantId = tenantScope(user);
  let query = supabase.from('watcher_notifications').update({ seen: true }).eq('id', id);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  query = query.eq('recipient', user.email);
  const { error } = await query;
  if (error) throw new Error(`markNotificationRead failed: ${error.message}`);
  // Broadcast so the same user's other open sessions clear the badge live.
  broadcast('notification_read', { id }, tenantId);
}
