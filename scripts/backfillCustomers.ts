// Backfill tool for the customer ↔ ticket linkage.
//
// Every ticket carrying a customer_email (and a business_unit) gets a
// customer_id that references the customers table, creating the customer row
// on demand via the same find-or-create semantics the ticket routes use.
//
// Idempotent: tickets that already have a customer_id are skipped.
//
// Usage:
//   npx tsx scripts/backfillCustomers.ts
import 'dotenv/config';
import { supabase } from '../server/supabase';
import { findOrCreateCustomer } from '../server/repository';

async function main() {
  const { data: tickets, error: ticketError } = await supabase
    .from('tickets')
    .select('id, customer_email, customer_id, business_unit')
    .eq('is_deleted', false)
    .limit(100000);
  if (ticketError) throw new Error(`read tickets failed: ${ticketError.message}`);

  const candidates = (tickets || []).filter(
    (t) => !t.customer_id && t.customer_email && t.customer_email.trim() && t.business_unit && t.business_unit.trim()
  );
  console.log(`Loaded ${tickets?.length || 0} active tickets; ${candidates.length} need linking.`);

  let linked = 0;
  const failures: string[] = [];

  for (const t of candidates) {
    try {
      const { id } = await findOrCreateCustomer({
        email: t.customer_email,
        businessUnit: t.business_unit,
        name: undefined,
      });
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ customer_id: id })
        .eq('id', t.id);
      if (updateError) {
        failures.push(t.id);
        console.warn(`  [FAIL] ticket ${t.id}: ${updateError.message}`);
      } else {
        linked += 1;
      }
    } catch (err: any) {
      failures.push(t.id);
      console.warn(`  [FAIL] ticket ${t.id}: ${err?.message || err}`);
    }
  }

  console.log(`Linked ${linked} ticket(s); failed ${failures.length}.`);
  if (failures.length > 0) console.log(`Failed ids: ${failures.slice(0, 20).join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
