import type { TicketRecord } from '../types/app';
import type { BuFormConfig, FormFieldValue } from '../types/forms';

export interface DuplicateCandidate {
  ticket: TicketRecord;
  confidence: number;
  matchedOn: string[];
  reason: string;
}

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length, 1);
}

export function normalizeKey(v: FormFieldValue | undefined | null): string {
  return String(v ?? '').trim().toLowerCase().replace(/[\s_\-/\\.,()]+/g, '');
}

export function ticketFieldValue(ticket: TicketRecord, fieldId: string): FormFieldValue {
  switch (fieldId) {
    case 'transactionId':
      return ticket.transactionId ?? '';
    case 'amount':
      return ticket.amount ?? 0;
    case 'bankName':
      return ticket.bankName ?? '';
    default:
      return ticket.customFields?.[fieldId] ?? '';
  }
}

export interface DetectOptions {
  threshold?: number;
  maxResults?: number;
}

export function detectDuplicates(
  values: Record<string, FormFieldValue>,
  config: BuFormConfig,
  allTickets: TicketRecord[],
  bu: string,
  opts: DetectOptions = {}
): DuplicateCandidate[] {
  const threshold = opts.threshold ?? 55;
  const maxResults = opts.maxResults ?? 5;

  const keys = config.fields.filter(f => f.enabled && f.duplicateKey);
  const keyValues = keys
    .map(f => ({ field: f, value: values[f.id] }))
    .filter(k => {
      const v = k.value;
      return v !== undefined && v !== null && String(v).trim() !== '';
    });

  if (keyValues.length === 0) return [];

  const scoped = allTickets.filter(
    t => t.businessUnit === bu && !t.isDeleted && t.id !== values['_ticketId']
  );

  const candidates: DuplicateCandidate[] = [];

  for (const ticket of scoped) {
    let total = 0;
    const matchedOn: string[] = [];

    for (const { field, value } of keyValues) {
      const existing = ticketFieldValue(ticket, field.id);
      const a = normalizeKey(value);
      const b = normalizeKey(existing);

      const numericType = field.type === 'number' || field.type === 'currency';
      if (numericType) {
        const na = Number(String(value).replace(/[^0-9.]/g, ''));
        const nb = Number(String(existing).replace(/[^0-9.]/g, ''));
        if (a && b && na === nb) {
          total += 55;
          matchedOn.push(field.label);
        }
        continue;
      }

      if (a && b && a === b) {
        total += 55;
        matchedOn.push(field.label);
        continue;
      }

      if (a && b && field.type === 'text') {
        const sim = similarity(a, b);
        if (sim >= 0.82) {
          total += Math.round(35 * sim);
          matchedOn.push(field.label);
        }
      }
    }

    if (matchedOn.length === 0) continue;

    const maxPerKey = 55;
    const base = (Math.min(total, keyValues.length * maxPerKey) / (keyValues.length * maxPerKey)) * 100;
    const multipleBoost = matchedOn.length > 1 ? 8 : 0;
    const confidence = Math.min(99, Math.round(base + multipleBoost));

    if (confidence >= threshold) {
      candidates.push({
        ticket,
        confidence,
        matchedOn,
        reason: matchedOn.join(', '),
      });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, maxResults);
}

export function buildDuplicatePayload(
  existing: TicketRecord,
  incoming: TicketRecord
): TicketRecord {
  return {
    ...existing,
    amount: incoming.amount > 0 ? incoming.amount : existing.amount,
    transactionId: incoming.transactionId ? incoming.transactionId : existing.transactionId,
    description: incoming.description
      ? `${existing.description}\n\n--- Append: New complaint filed by ${incoming.customerName} ---\n${incoming.description}`
      : existing.description,
    customFields: {
      ...(existing.customFields || {}),
      ...(incoming.customFields || {}),
    },
  };
}
