import { supabase } from './supabase';
import { hashPassword, supabaseCreateUser } from './auth';
import { computeAuditHash, verifyAuditChain } from './compliance';
import { setConfig } from './repository';
import { tenantIdForBu, GLOBAL_TENANT_ID } from './tenant';

export async function isDatabaseEmpty(): Promise<boolean> {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });
  if (error) return true;
  return (count || 0) === 0;
}

export async function seedDatabase(): Promise<boolean> {
  // Fail-closed: seeding known-password demo users is never permitted against a
  // production environment, even if invoked directly by tooling.
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data in a production environment.');
    return false;
  }
  const empty = await isDatabaseEmpty();
  if (!empty) return false;

  const now = Date.now();
  const day = 86400000;

  // Tickets (mirrors src/lib/seedData.ts getSeedTickets; issue_type = category)
  const tickets = [
    {
      id: 'TKT-2407-001', customer_name: 'Faith Adeleke', customer_email: 'faith@example.com', customer_id: 'cust-seed-1',
      business_unit: 'POSSAP', provider: 'Paystack', category: 'Payment Dispute', issue_type: 'Payment Dispute',
      priority: 'HIGH', status: 'INVESTIGATE', amount: 45000, transaction_id: 'TXN-20240715-8942',
      card_pan: '****', bank_name: 'Undefined', description: 'Double charge on POS transaction — customer was billed twice for a single purchase of ₦45,000 at ShopRite Ikeja.',
      created_at: new Date(now - 2 * day).toISOString(), sla_deadline: new Date(now + 6 * day).toISOString(),
      is_escalated: false, escalation_count: 0, assigned_agent_id: 'Emeka Nwosu',
      major_incident_id: null, submitted_by: 'BU_SUPPORT', watchers: [],
    },
    {
      id: 'TKT-2407-002', customer_name: 'Bayo Ogunlade', customer_email: 'bayo@example.com', customer_id: 'cust-seed-2',
      business_unit: 'RETAIL-B', provider: 'Flutterwave', category: 'Technical Issue', issue_type: 'Technical Issue',
      priority: 'CRITICAL', status: 'INVESTIGATE', amount: 15000, transaction_id: 'TXN-20240716-1234',
      card_pan: '****', bank_name: 'Undefined', description: 'Payment gateway timeout during subscription renewal — customer unable to complete ₦15,000 monthly subscription payment.',
      created_at: new Date(now - 1 * day).toISOString(), sla_deadline: new Date(now + 0.5 * day).toISOString(),
      is_escalated: true, escalation_count: 1, assigned_agent_id: 'Sarah Okafor',
      major_incident_id: 'MI-2024-001', submitted_by: 'PARTNER', watchers: [],
    },
    {
      id: 'TKT-2407-003', customer_name: 'Ngozi Eze', customer_email: 'ngozi@example.com', customer_id: 'cust-seed-3',
      business_unit: 'CORPORATE', provider: 'Interswitch', category: 'Payment Dispute', issue_type: 'Payment Dispute',
      priority: 'MEDIUM', status: 'RESOLVED', amount: 230000, transaction_id: 'TXN-20240705-6711',
      card_pan: '****', bank_name: 'Undefined', description: 'Customer disputes ₦230,000 transaction — claims unauthorized use of debit card.',
      created_at: new Date(now - 10 * day).toISOString(), sla_deadline: new Date(now - 2 * day).toISOString(),
      is_escalated: false, escalation_count: 0, assigned_agent_id: 'Adaobi Okeke',
      major_incident_id: null, feedback_score: 4, feedback_comment: 'Resolved promptly with full refund.',
      root_cause: 'Card details compromised via phishing', corrective_action: 'Full reversal processed and card blocked',
      rca_details: {
        rootCause: 'Card details compromised via phishing',
        contributingFactors: 'Customer entered card details on fake merchant site',
        correctiveActions: 'Full reversal processed and card blocked',
        preventiveActions: 'Customer advised on card security best practices',
        preventiveOwner: 'Adaobi Okeke',
        preventiveDueDate: new Date(now + 14 * day).toISOString().split('T')[0],
        resolvedAt: new Date(now - 3 * day).toISOString(),
        resolvedBy: 'Adaobi Okeke',
      },
      submitted_by: 'BU_SUPPORT', watchers: [],
    },
    {
      id: 'TKT-2407-004', customer_name: 'Kola Adetokunbo', customer_email: 'kola@example.com',
      business_unit: 'DIGITAL', provider: 'Remita', category: 'Account Issue', issue_type: 'Account Issue',
      priority: 'MEDIUM', status: 'RECEIPT', amount: 0, transaction_id: 'TXN-20240720-5581',
      card_pan: '****', bank_name: 'Undefined', description: 'Customer reports an unidentified debit on their corporate account — pending intake and agent assignment.',
      created_at: new Date(now - 0.2 * day).toISOString(), sla_deadline: new Date(now + 1 * day).toISOString(),
      is_escalated: false, escalation_count: 0, assigned_agent_id: '',
      major_incident_id: null, submitted_by: 'BU_SUPPORT', watchers: [],
    },
    {
      id: 'TKT-2407-005', customer_name: 'Amina Bello', customer_email: 'amina@example.com',
      business_unit: 'SME', provider: 'Paystack', category: 'Payment Dispute', issue_type: 'Payment Dispute',
      priority: 'HIGH', status: 'ASSIGNED', amount: 120000, transaction_id: 'TXN-20240719-3390',
      card_pan: '****', bank_name: 'Undefined', description: 'Customer charged twice for a ₦120,000 invoice — ticket assigned to Paystack provider team for review.',
      created_at: new Date(now - 0.5 * day).toISOString(), sla_deadline: new Date(now + 2 * day).toISOString(),
      is_escalated: false, escalation_count: 0, assigned_agent_id: 'Paystack Provider Team',
      major_incident_id: null, submitted_by: 'PARTNER', watchers: [],
    },
    {
      id: 'TKT-2407-006', customer_name: 'Ibrahim Musa', customer_email: 'ibrahim@example.com',
      business_unit: 'RETAIL-B', provider: 'Parkway', category: 'Payment Dispute', issue_type: 'Payment Dispute',
      priority: 'MEDIUM', status: 'CLOSED', amount: 85000, transaction_id: 'TXN-20240630-2204',
      card_pan: '****', bank_name: 'Undefined', description: 'Duplicate charge on Parkway card — fully reversed and closed after customer verification.',
      created_at: new Date(now - 20 * day).toISOString(), sla_deadline: new Date(now - 12 * day).toISOString(),
      is_escalated: false, escalation_count: 0, assigned_agent_id: 'Adaobi Okeke',
      major_incident_id: null, feedback_score: 5, feedback_comment: 'Refund received and verified.',
      root_cause: 'Duplicate charge from double swipe', corrective_action: 'Automatic reversal executed via API',
      rca_details: {
        rootCause: 'Duplicate charge from double swipe',
        contributingFactors: 'Merchant terminal retry sent duplicate authorization',
        correctiveActions: 'Automatic reversal executed via API',
        preventiveActions: 'Merchant terminal firmware updated',
        preventiveOwner: 'Parkway Engineering',
        preventiveDueDate: new Date(now + 7 * day).toISOString().split('T')[0],
        resolvedAt: new Date(now - 15 * day).toISOString(),
        resolvedBy: 'Adaobi Okeke',
      },
      submitted_by: 'BU_SUPPORT', watchers: [],
    },
  ];

  // One tenant per business unit plus the global fallback tenant.
  const businessUnits = ['POSSAP', 'RETAIL-B', 'CORPORATE', 'SME', 'DIGITAL'];
  const tenants = [
    { id: GLOBAL_TENANT_ID, name: 'GLOBAL', business_units: [] as string[] },
    ...businessUnits.map(bu => ({ id: tenantIdForBu(bu), name: bu, business_units: [bu] as string[] })),
  ];
  await supabase.from('tenants').upsert(tenants, { onConflict: 'id' });

  // Users (mirrors src/lib/seedData.ts SEED_USERS)
  const users = [
    { id: 'usr-seed-1', name: 'Sarah Okafor', email: 'sarah.okafor@4core.com', role: 'BU_SUPPORT', bu: 'POSSAP', phone: '+234-801-000-1001' },
    { id: 'usr-seed-2', name: 'Emeka Nwosu', email: 'emeka.nwosu@4core.com', role: 'PROVIDER', bu: 'Paystack', phone: '+234-802-000-2002' },
    { id: 'usr-seed-3', name: 'Chioma Adebayo', email: 'chioma.adebayo@4core.com', role: 'PARTNER', bu: 'POSSAP', phone: '+234-803-000-3003' },
    { id: 'usr-seed-4', name: 'Tunde Balogun', email: 'tunde.balogun@4core.com', role: 'EXECUTIVE', bu: 'POSSAP', phone: '+234-804-000-4004' },
    { id: 'usr-seed-5', name: 'Adaobi Okeke', email: 'adaobi.okeke@4core.com', role: 'SUPER_ADMIN', bu: 'POSSAP', phone: '+234-805-000-5005' },
  ];
  const userTenantId = (u: (typeof users)[number]): string => {
    if (u.role === 'SUPER_ADMIN' || u.role === 'EXECUTIVE') return GLOBAL_TENANT_ID;
    if (u.role === 'PROVIDER') {
      const ticket = tickets.find(t => t.provider.toLowerCase() === u.bu.toLowerCase());
      return ticket ? tenantIdForBu(ticket.business_unit) : GLOBAL_TENANT_ID;
    }
    return tenantIdForBu(u.bu);
  };
  // Every login goes through Supabase Auth, so each demo user needs a Supabase
  // identity. Create one per user with the demo password, link auth_user_id, and
  // keep must_change_password false (seed users are already "provisioned" with
  // their demo credentials so the app is immediately usable).
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) throw new Error('DEMO_PASSWORD environment variable is required for seeding');
  const seededUsers = [];
  for (const u of users) {
    let authUserId: string | null = null;
    try {
      const created = await supabaseCreateUser(u.email, demoPassword, u.name);
      authUserId = created.id;
    } catch {
      // Identity may already exist from a prior seed partial run; login still
      // resolves the user row by email in that case.
    }
    seededUsers.push({ ...u, tenant_id: userTenantId(u), password_hash: hashPassword(demoPassword), auth_user_id: authUserId, must_change_password: false });
  }
  await supabase.from('users').insert(seededUsers);

  await supabase.from('tickets').upsert(tickets.map(t => ({ ...t, tenant_id: tenantIdForBu(t.business_unit) })), { onConflict: 'id' });

  const ticketTenant = (ticketId: string): string => {
    const ticket = tickets.find(t => t.id === ticketId);
    return ticket ? tenantIdForBu(ticket.business_unit) : GLOBAL_TENANT_ID;
  };

  // Comments (mirrors src/lib/seedData.ts SEED_COMMENTS)
  const comments = [
    { id: 'cmt-seed-1', ticket_id: 'TKT-2407-001', author: 'Emeka Nwosu', role: 'Provider', message: 'Checking Paystack logs for this transaction. Will update shortly.', timestamp: new Date(now - 1.5 * day).toISOString(), is_internal: false, seen: true, seen_by: '[]' },
    { id: 'cmt-seed-2', ticket_id: 'TKT-2407-002', author: 'Sarah Okafor', role: 'BU Support', message: 'Escalated to Flutterwave NOC team. Incident MI-2024-001 has been declared.', timestamp: new Date(now - 0.8 * day).toISOString(), is_internal: true, seen: true, seen_by: '[]' },
    { id: 'cmt-seed-3', ticket_id: 'TKT-2407-003', author: 'Adaobi Okeke', role: 'Super Admin', message: 'Chargeback rebuttal submitted to Interswitch. Awaiting bank confirmation.', timestamp: new Date(now - 5 * day).toISOString(), is_internal: false, seen: true, seen_by: '[]' },
  ];
  await supabase.from('comments').insert(comments.map(c => ({ ...c, tenant_id: ticketTenant(c.ticket_id) })));

  // Audit log with hash chain. Sort by timestamp ascending before chaining so
  // the declared order of auditEntries can never desync the chain from the
  // chronological order the verify endpoint will read.
  const auditEntries = [
    { id: 'aud-seed-3', timestamp: new Date(now - 10 * day).toISOString(), ticketId: 'TKT-2407-003', actor: 'Sarah Okafor', role: 'BU_SUPPORT', action: 'CREATED_TICKET', details: 'Ticket created from email complaint.' },
    { id: 'aud-seed-1', timestamp: new Date(now - 2 * day).toISOString(), ticketId: 'TKT-2407-001', actor: 'Sarah Okafor', role: 'BU_SUPPORT', action: 'CREATED_TICKET', details: 'Ticket created via customer call intake.' },
    { id: 'aud-seed-2', timestamp: new Date(now - 1 * day).toISOString(), ticketId: 'TKT-2407-002', actor: 'Chioma Adebayo', role: 'PARTNER', action: 'SUBMITTED_TICKET', details: 'Ticket submitted via partner portal.' },
  ];
  const chronological = [...auditEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let lastHash = '';
  const auditRows = chronological.map((e) => {
    const previousHash = lastHash;
    const hash = computeAuditHash({ id: e.id, timestamp: e.timestamp, ticketId: e.ticketId, actor: e.actor, role: e.role, action: e.action, details: e.details, previousHash });
    lastHash = hash;
    return { id: e.id, timestamp: e.timestamp, ticket_id: e.ticketId, actor: e.actor, role: e.role, action: e.action, details: e.details, hash, previous_hash: previousHash, immutable: true, tenant_id: ticketTenant(e.ticketId) };
  });
  await supabase.from('audit_logs').insert(auditRows);

  // Self-verify the just-seeded chain so future regressions fail loudly during
  // seed rather than at runtime when the verify endpoint is first hit.
  const seedChain = auditRows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    ticketId: r.ticket_id,
    actor: r.actor,
    role: r.role,
    action: r.action,
    details: r.details,
    hash: r.hash,
    previousHash: r.previous_hash,
  }));
  const verify = verifyAuditChain(seedChain);
  if (!verify.valid) {
    throw new Error(`Seeded audit chain failed verification at index ${verify.brokenIndex}. Seed aborted.`);
  }

  // Major incidents (mirrors src/lib/seedData.ts getSeedMajorIncidents)
  const majorIncidents = [
    {
      id: 'MI-2024-001', name: 'Paystack Widespread Outage',
      description: 'Nationwide Paystack payment gateway outage affecting 200+ merchants. All payment processing halted.',
      provider: 'Paystack', category: 'Payment Gateway Integration', severity: 'CRITICAL', active: true, ticket_count: 3,
      created_at: new Date(now - 6 * day).toISOString(), status: 'IDENTIFIED',
      timeline: [
        { id: 'mi-tl-1', timestamp: new Date(now - 6 * day).toISOString(), author: 'Sarah Okafor', role: 'BU Support', message: 'Major incident declared — Paystack gateway returning 503 for all requests.' },
        { id: 'mi-tl-2', timestamp: new Date(now - 5.5 * day).toISOString(), author: 'Emeka Nwosu', role: 'Provider', message: 'Paystack NOC identified AWS us-east-1 DNS resolution failure. Failover in progress.' },
      ],
      notifications: [
        { id: 'mi-not-1', timestamp: new Date(now - 6 * day).toISOString(), channel: 'Slack Webhook', recipient: '#ops-war-room', subject: 'CRITICAL: Paystack Outage', status: 'SENT' },
      ],
      pir: {
        rootCauseSummary: 'AWS region us-east-1 DNS resolution failure',
        timelineSummary: 'Outage detected 08:14 UTC; failover initiated 08:42; services restored 10:05',
        impactSummary: '12,450 transactions failed over 4 hours',
        preventiveOwner: 'DevOps Team',
        preventiveDueDate: new Date(now + 30 * day).toISOString().split('T')[0],
        draft: false,
        lastUpdated: new Date(now - 5 * day).toISOString(),
        lastUpdatedBy: 'Sarah Okafor',
      },
    },
    {
      id: 'MI-2024-002', name: 'Parkway Double Charge Bug',
      description: 'System bug causing duplicate charges on Visa cards during high-traffic periods.',
      provider: 'Parkway', category: 'Software Bug', severity: 'HIGH', active: false, ticket_count: 1,
      created_at: new Date(now - 60 * day).toISOString(), status: 'RESOLVED',
      timeline: [
        { id: 'mi-tl-3', timestamp: new Date(now - 60 * day).toISOString(), author: 'Emeka Nwosu', role: 'Provider', message: 'Duplicate charge pattern identified on Visa cards. Engineering team engaged.' },
        { id: 'mi-tl-4', timestamp: new Date(now - 55 * day).toISOString(), author: 'Emeka Nwosu', role: 'Provider', message: 'Race condition fix deployed to production. Monitoring for 48 hours.' },
      ],
      notifications: [
        { id: 'mi-not-2', timestamp: new Date(now - 60 * day).toISOString(), channel: 'Email Broadcast', recipient: 'compliance@4core.com', subject: 'HIGH: Parkway Duplicate Charge Incident', status: 'SENT' },
      ],
      pir: {
        rootCauseSummary: 'Race condition in payment confirmation handler',
        timelineSummary: 'Bug introduced in v2.14.3; detected 3 days post-deploy; hotfix v2.14.4 deployed same day',
        impactSummary: '342 customers double-charged, total ₦4.2M in duplicate claims',
        preventiveOwner: 'Engineering Team',
        preventiveDueDate: new Date(now + 15 * day).toISOString().split('T')[0],
        draft: false,
        lastUpdated: new Date(now - 28 * day).toISOString(),
        lastUpdatedBy: 'Emeka Nwosu',
      },
    },
  ];
  const incidentTenant = (provider: string): string => {
    const ticket = tickets.find(t => t.provider === provider);
    return ticket ? tenantIdForBu(ticket.business_unit) : GLOBAL_TENANT_ID;
  };
  await supabase.from('major_incidents').insert(majorIncidents.map(mi => ({ ...mi, tenant_id: incidentTenant(mi.provider) })));

  // Customers (mirrors src/lib/seedData.ts SEED_CUSTOMERS)
  const customers = [
    { id: 'cust-seed-1', first_name: 'Faith', last_name: 'Adeleke', email: 'faith@example.com', phone: '+234-806-000-6006', business_unit: 'POSSAP', created_at: new Date(now - 90 * day).toISOString(), total_tickets: 3 },
    { id: 'cust-seed-2', first_name: 'Bayo', last_name: 'Ogunlade', email: 'bayo@example.com', phone: '+234-807-000-7007', business_unit: 'RETAIL-B', created_at: new Date(now - 60 * day).toISOString(), total_tickets: 1 },
    { id: 'cust-seed-3', first_name: 'Ngozi', last_name: 'Eze', email: 'ngozi@example.com', phone: '+234-808-000-8008', business_unit: 'CORPORATE', created_at: new Date(now - 180 * day).toISOString(), total_tickets: 5 },
  ];
  await supabase.from('customers').insert(customers.map(c => ({ ...c, tenant_id: tenantIdForBu(c.business_unit) })));

  // SLA rules (mirrors src/lib/seedData.ts SEED_SLA_RULES)
  const slaRules = [
    { id: 'sla-1', category: 'Duplicate Debit', priority: 'CRITICAL', duration_hours: 4 },
    { id: 'sla-2', category: 'Duplicate Debit', priority: 'HIGH', duration_hours: 8 },
    { id: 'sla-3', category: 'Payment Dispute', priority: 'MEDIUM', duration_hours: 24 },
    { id: 'sla-4', category: 'Technical Issue', priority: 'HIGH', duration_hours: 12 },
    { id: 'sla-5', category: 'Gateway Timeout', priority: 'CRITICAL', duration_hours: 2 },
  ];
  await supabase.from('sla_rules').insert(slaRules);

  // Holidays (mirrors src/lib/seedData.ts SEED_HOLIDAYS)
  const holidays = [
    { id: 'hld-1', name: 'New Year Day', date: new Date(now + 30 * day).toISOString().split('T')[0], country: 'NG' },
    { id: 'hld-2', name: 'Easter Monday', date: new Date(now + 90 * day).toISOString().split('T')[0], country: 'NG' },
    { id: 'hld-3', name: 'Democracy Day', date: new Date(now + 120 * day).toISOString().split('T')[0], country: 'NG' },
  ];
  await supabase.from('holidays').insert(holidays);

  // Ticket templates (mirrors src/lib/seedData.ts SEED_TEMPLATES; issue_type = category)
  const templates = [
    { id: 'tmpl-1', name: 'Parkway Double Swipe', description: 'Customer charged twice on Parkway', category: 'Duplicate Debit', issue_type: 'Duplicate Debit', priority: 'HIGH', provider: 'Parkway', amount: '', ticket_description: 'Customer reports being charged twice for the same transaction. Transaction ID: [ID]. Amount: [AMOUNT]. Date: [DATE].' },
    { id: 'tmpl-2', name: 'Paystack Gateway Timeout', description: 'Payment gateway not responding', category: 'Gateway Timeout', issue_type: 'Gateway Timeout', priority: 'CRITICAL', provider: 'Paystack', amount: '', ticket_description: 'Payment gateway timeout occurred during transaction. Merchant: [MERCHANT]. Amount: [AMOUNT]. Timestamp: [TIME].' },
    { id: 'tmpl-3', name: 'Account Lockout', description: 'User locked out after failed attempts', category: 'Account Locked', issue_type: 'Account Locked', priority: 'MEDIUM', provider: 'General', amount: '', ticket_description: 'User unable to login after [N] failed attempts. Email: [EMAIL]. Last successful login: [DATE].' },
  ];
  await supabase.from('ticket_templates').insert(templates);

  // KB articles (mirrors src/lib/seedData.ts SEED_KB_ARTICLES)
  const kbArticles = [
    { id: 'kb-1', title: 'Parkway 504 Gateway Timeout — Remediation Playbook', category: 'Playbook', provider: 'General', content: '## Parkway 504 Gateway Timeout Remediation\n\n1. Verify Parkway status at status.stripe.com\n2. Check server firewall rules for outbound traffic on port 443\n3. Restart the payment processing service\n4. Enable Parkway retry logic with exponential backoff\n5. Monitor for 15 minutes before escalating to DevOps\n\n**Contact:** DevOps Team (ext. 2201)', tags: ['parkway', 'gateway', 'timeout'], last_updated: new Date(now - 2 * day).toISOString() },
    { id: 'kb-2', title: 'Chargeback Dispute Handling Workflow', category: 'Playbook', provider: 'General', content: '## Chargeback Dispute Process\n\n1. Receive chargeback notification from bank\n2. Gather transaction evidence (receipt, IP logs, device fingerprint)\n3. Submit rebuttal letter within 7 days\n4. Track dispute status weekly\n5. Escalate to legal if amount > ₦500,000', tags: ['chargeback', 'dispute', 'rebuttal'], last_updated: new Date(now - 5 * day).toISOString() },
  ];
  await supabase.from('kb_articles').insert(kbArticles);

  // App config (categories without sub-types; mirrors SEED_BUSINESS_UNITS/PROVIDERS/CATEGORIES)
  await setConfig('businessUnits', ['POSSAP', 'RETAIL-B', 'CORPORATE', 'SME', 'DIGITAL']);
  await setConfig('providers', ['Paystack', 'Flutterwave', 'Interswitch', 'Remita', 'Parkway']);
  await setConfig('categories', [
    { name: 'Payment Dispute', description: 'Transaction disputes and chargebacks' },
    { name: 'Technical Issue', description: 'System and integration failures' },
    { name: 'Account Issue', description: 'Account and profile problems' },
  ]);
  await setConfig('notificationConfigs', [
    { id: '1', stage: 'Receipt', email: 'bu-support@company.com' },
    { id: '2', stage: 'Investigation', email: 'parkway-investigations@parkway.com' },
    { id: '3', stage: 'Resolution', email: 'compliance-alerts@company.com' },
  ]);
  await setConfig('savedReplies', [
    'We have identified a gateway communication timeout on our provider end. Initiating reconciliation check.',
    'The transaction settlement delay has been resolved. Funds should reflect within 24-48 hours.',
    'This charge has been flagged as a duplicate. We are initiating an automated reversal via API.',
  ]);
  await setConfig('escalationRules', [
    { id: 'esc-1', condition: 'SLA deadline breached', level: 'Level 1 - BU Support', target: 'BU Support Team', action: 'Flag CRITICAL and notify ticket watchers' },
    { id: 'esc-2', condition: 'Manual escalation by BU Support', level: 'Level 2 - Super Admin', target: 'Super Admin', action: 'Escalate to CRITICAL priority with audit record' },
    { id: 'esc-3', condition: 'No provider response within 6 hours', level: 'Level 3 - Executive', target: 'Executive Office', action: 'Trigger Major Incident review' },
  ]);

  console.log('Supabase database seeded successfully.');
  return true;
}
