import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../server/supabase', () => {
  const s = { from: () => { throw new Error('supabase not initialised in this test'); } };
  return { supabase: s, supabaseAuth: s };
});

import { supabase } from '../server/supabase';
import { runSlaCheck } from '../server/slaJob';
import { createFakeSupabase } from './helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';

function openTicket(slaDeadline: string) {
  return {
    id: 'tkt-sla',
    business_unit: 'ALPHA',
    tenant_id: ALPHA,
    provider: 'Paystack',
    category: 'Payment Dispute',
    issue_type: 'Payment Dispute',
    priority: 'HIGH',
    status: 'INVESTIGATE',
    is_deleted: false,
    created_at: '2026-07-01T00:00:00Z',
    sla_deadline: slaDeadline,
    customer_name: 'Faith',
    customer_email: 'faith@example.com',
    customer_phone: '',
    amount: 100,
    transaction_id: 'TX1',
    card_pan: '****',
    description: '',
    is_escalated: false,
    escalation_count: 0,
    assigned_agent_id: '',
    watchers: ['sla@example.com'],
    rca_details: null,
    custom_fields: {},
    duplicate_of: null,
  };
}

function seedStore(slaDeadline: string) {
  return {
    tickets: [openTicket(slaDeadline)],
    watcher_notifications: [],
    audit_logs: [],
    app_config: [],
  };
}

describe('SLA monitor job', () => {
  beforeEach(() => {
    Object.assign(supabase, createFakeSupabase({}));
  });

  it('detects a breach and audits it once per ticket', async () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    Object.assign(supabase, createFakeSupabase(seedStore(past)));

    const first = await runSlaCheck();
    expect(first.breachCount).toBe(1);
    expect(first.scanned).toBe(1);

    const { data: notifications } = await supabase.from('watcher_notifications').select('*');
    expect((notifications as any[]).length).toBe(1);
    expect((notifications as any[])[0].message).toContain('[SLA_BREACH]');

    const { data: audits } = await supabase.from('audit_logs').select('*');
    expect((audits as any[]).length).toBe(1);
    expect((audits as any[])[0].action).toBe('SLA_BREACH_DETECTED');

    // Second tick must not duplicate notifications or audit entries.
    const second = await runSlaCheck();
    expect(second.breachCount).toBe(1);
    const { data: notifications2 } = await supabase.from('watcher_notifications').select('*');
    const { data: audits2 } = await supabase.from('audit_logs').select('*');
    expect((notifications2 as any[]).length).toBe(1);
    expect((audits2 as any[]).length).toBe(1);
  });

  it('does not notify for tickets with a future deadline', async () => {
    const future = new Date(Date.now() + 5 * 3600000).toISOString();
    Object.assign(supabase, createFakeSupabase(seedStore(future)));
    const result = await runSlaCheck();
    expect(result.breachCount).toBe(0);
    expect(result.riskCount).toBe(0);
    const { data } = await supabase.from('watcher_notifications').select('*');
    expect((data as any[]).length).toBe(0);
  });

  it('skips tickets whose SLA deadline is unparseable', async () => {
    Object.assign(supabase, createFakeSupabase(seedStore('not-a-date')));
    const result = await runSlaCheck();
    expect(result.breachCount).toBe(0);
    expect(result.scanned).toBe(1);
    const { data } = await supabase.from('watcher_notifications').select('*');
    expect((data as any[]).length).toBe(0);
  });
});