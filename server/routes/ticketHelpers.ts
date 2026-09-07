import { z } from 'zod';
import { supabase } from '../supabase';
import { getConfig } from '../repository';
import { normalizeBusinessUnits, yymmdd } from '../../src/lib/buCodes';
import { buildId } from '../lib/ids';
import { nextTicketSequence } from '../repository';
import { TicketStatus, TicketPriority, UserRole } from '../../src/types/app';
import type { SlaRule } from '../../src/types/admin';
import type { HolidayRecord } from '../../src/types/admin';

/** Roles that file complaints on behalf of customers. The logging officer is
 *  always recorded so tickets never conflate the customer with the submitter. */
export const STAFF_SUBMITTER_ROLES = ['BU_SUPPORT', 'BU_SUPPORT_L1', 'BU_SUPPORT_L2', 'BU_SUPPORT_L3', 'PARTNER', 'SUPER_ADMIN', 'EXECUTIVE'];

/** Dedupe a watcher list and drop the acting user so senders don't email themselves. */
export function ticketWatcherRecipients(watchers: string[] | undefined, excludeEmail: string): string[] {
  const ex = (excludeEmail || '').trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of watchers || []) {
    const e = (w || '').trim();
    if (!e || e.toLowerCase() === ex || seen.has(e.toLowerCase())) continue;
    seen.add(e.toLowerCase());
    out.push(e);
  }
  return out;
}

/**
 * Build a BU-scoped ticket id without loading every ticket into memory.
 * Primary path: atomic per-(BU,date) counter via the next_ticket_id_sequence
 * RPC — collision-free under concurrent submissions.
 * Fallback (RPC unavailable): scan only ids sharing today's prefix instead of
 * fetching the full ticket list.
 */
export async function buildTicketId(businessUnit: string | undefined): Promise<string> {
  const buRaw = await getConfig<any[]>('businessUnits', []);
  const buUnits = normalizeBusinessUnits(buRaw);
  const now = new Date();
  const code = (businessUnit || '').trim() ? (buUnits.find((b) => b.name.toUpperCase() === businessUnit!.toUpperCase())?.code) : undefined;
  if (!code) {
    return buildId('tkt');
  }
  const dateKey = yymmdd(now);
  // Atomic reservation — safe at any concurrency level.
  const seq = await nextTicketSequence(code.toUpperCase(), dateKey);
  if (seq !== null) {
    return `${code}-${dateKey}-${String(seq).padStart(3, '0')}`;
  }
  // Legacy fallback: prefix-bounded max computation (single indexed column).
  const prefix = `${code}-${dateKey}-`;
  const { data } = await supabase.from('tickets').select('id').ilike('id', `${prefix}%`);
  let max = 0;
  for (const r of data ?? []) {
    const n = parseInt(String((r as any).id).slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export const createTicketSchema = z.object({
  id: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string({ error: 'Customer email is required' }).trim().min(1, 'Customer email is required'),
  customerPhone: z.string().optional(),
  customerLastName: z.string().optional(),
  customerId: z.string().optional(),
  businessUnit: z.string({ error: 'Business unit is required' }).trim().min(1, 'Business unit is required'),
  partner: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'WAITING_INTERNAL']).optional(),
  amount: z.number().optional(),
  transactionId: z.string().optional(),
  cardPan: z.string().optional(),
  description: z.string().optional(),
  bankName: z.string().optional(),
  slaDeadline: z.string().optional(),
  assignedAgentId: z.string().optional(),
  majorIncidentId: z.string().nullable().optional(),
  watchers: z.array(z.string()).optional(),
  submittedBy: z.enum(['BU_SUPPORT', 'PARTNER', 'CUSTOMER']).optional(),
  submittedByName: z.string().optional(),
  submittedByPhone: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  duplicateOf: z.string().nullable().optional(),
});

export const updateTicketSchema = z.object({
  // `status` and `to` are both accepted for backwards compatibility, but every
  // status change is routed through the state machine — the generic patch path
  // below never applies a raw status.
  status: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'WAITING_INTERNAL']).optional(),
  to: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'WAITING_INTERNAL']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  transactionId: z.string().optional(),
  partner: z.string().optional(),
  businessUnit: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  assignedAgentId: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  isEscalated: z.boolean().optional(),
  escalationCount: z.number().optional(),
  bankName: z.string().optional(),
  watchers: z.array(z.string()).optional(),
  feedbackScore: z.number().nullable().optional(),
  feedbackComment: z.string().nullable().optional(),
  isDeleted: z.boolean().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  duplicateOf: z.string().optional(),
});
