// Repair tool for the audit hash ledger.
//
// Recomputes the append-only hash chain for `audit_logs` in chronological
// (timestamp, id) order, fixing rows whose `previous_hash` / `hash` do not link
// (e.g. malformed rows written by legacy migration scripts).
//
// Uses the app's env-driven Supabase client (SUPABASE_URL + SUPABASE_SERVICE_KEY),
// NOT the archived committed-token pattern.
//
// Usage:
//   npx tsx scripts/repairAuditChain.ts          # dry-run, reports rows to fix
//   npx tsx scripts/repairAuditChain.ts --apply  # write corrected rows
import 'dotenv/config';
import { supabase } from '../server/supabase';
import { computeAuditHash, type AuditEntry } from '../server/compliance';

const APPLY = process.argv.slice(2).includes('--apply');

function toCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = value;
  }
  return result;
}

async function main() {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: true })
    .order('id', { ascending: true })
    .limit(50000);

  if (error) throw new Error(`read audit_logs failed: ${error.message}`);
  if (!data || data.length === 0) {
    console.log('No audit rows found.');
    return;
  }

  console.log(`Loaded ${data.length} audit rows (apply=${APPLY}).`);

  let previousHash = '';
  const toFix: { id: string; field: string }[] = [];
  const rowsToWrite: { id: string; hash: string; previous_hash: string }[] = [];

  for (const raw of data) {
    const row = toCamel(raw);
    const expectedPrevious = previousHash;
    if ((row.previousHash || '') !== expectedPrevious) {
      toFix.push({ id: row.id, field: 'previous_hash' });
    }
    const recomputed = computeAuditHash({
      id: row.id,
      timestamp: row.timestamp,
      ticketId: row.ticketId ?? null,
      actor: row.actor,
      role: row.role,
      action: row.action,
      details: row.details,
      previousHash: expectedPrevious,
    } as Omit<AuditEntry, 'hash'> & { previousHash: string });
    if (row.hash !== recomputed) {
      toFix.push({ id: row.id, field: 'hash' });
    }
    if (APPLY && (row.hash !== recomputed || (row.previousHash || '') !== expectedPrevious)) {
      rowsToWrite.push({ id: row.id, hash: recomputed, previous_hash: expectedPrevious });
    }
    previousHash = recomputed;
  }

  if (APPLY && rowsToWrite.length > 0) {
    const CHUNK = 50;
    let updated = 0;
    let failed: string[] = [];
    for (let i = 0; i < rowsToWrite.length; i += CHUNK) {
      const chunk = rowsToWrite.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        chunk.map((r) => supabase.from('audit_logs').update({ hash: r.hash, previous_hash: r.previous_hash }).eq('id', r.id))
      );
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled' && !res.value.error) {
          updated += 1;
        } else {
          failed.push(chunk[idx].id);
        }
      });
    }
    if (failed.length > 0) {
      const retries = await Promise.allSettled(
        failed.map((id) => {
          const r = rowsToWrite.find((x) => x.id === id)!;
          return supabase.from('audit_logs').update({ hash: r.hash, previous_hash: r.previous_hash }).eq('id', id);
        })
      );
      retries.forEach((res, idx) => {
        if (res.status === 'fulfilled' && !res.value.error) {
          updated += 1;
          failed[idx] = '';
        }
      });
      failed = failed.filter(Boolean);
    }
    console.log(`Applied: ${updated} row(s) updated, ${failed.length} failed.`);
    if (failed.length > 0) console.log(`Failed ids: ${failed.slice(0, 20).join(', ')}`);
  }

  const uniqueBroken = [...new Set(toFix.map((f) => f.id))];
  if (uniqueBroken.length === 0) {
    console.log('Chain is consistent — no rows need repair.');
  } else {
    console.log(`\n${uniqueBroken.length} row(s) out of chain (first 20):`);
    for (const id of uniqueBroken.slice(0, 20)) console.log(`  ${id}`);
  }

  if (APPLY) {
    console.log('Apply run finished.');
  } else {
    console.log('\nDry-run complete. Re-run with --apply to rewrite the chain.');
    console.log('WARNING: rewriting recomputes every hash from the genesis row.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});