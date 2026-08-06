import { TicketStatus, TicketPriority, UserRole, type TicketRecord, type CommentRecord, type AuditLog, type MajorIncidentRecord, type CustomerRecord } from '../types/app';
import { type UserRecord, type SlaRule, type HolidayRecord, type TicketTemplate, type KbArticle, type CategoryRecord } from '../types/admin';

const now = Date.now();
const day = 86400000;

export const SEED_USERS: UserRecord[] = [
  { id: 'usr-seed-1', firstName: 'Sarah', lastName: 'Okafor', email: 'sarah.okafor@4core.com', role: UserRole.BU_SUPPORT, bu: 'POSSAP', phone: '+234-801-000-1001' },
  { id: 'usr-seed-2', firstName: 'Emeka', lastName: 'Nwosu', email: 'emeka.nwosu@4core.com', role: UserRole.PROVIDER, bu: 'Paystack', phone: '+234-802-000-2002' },
  { id: 'usr-seed-3', firstName: 'Chioma', lastName: 'Adebayo', email: 'chioma.adebayo@4core.com', role: UserRole.PARTNER, bu: 'POSSAP', phone: '+234-803-000-3003' },
  { id: 'usr-seed-4', firstName: 'Tunde', lastName: 'Balogun', email: 'tunde.balogun@4core.com', role: UserRole.EXECUTIVE, bu: 'POSSAP', phone: '+234-804-000-4004' },
  { id: 'usr-seed-5', firstName: 'Adaobi', lastName: 'Okeke', email: 'adaobi.okeke@4core.com', role: UserRole.SUPER_ADMIN, bu: 'POSSAP', phone: '+234-805-000-5005' },
];

export const SEED_BUSINESS_UNITS = ['POSSAP', 'RETAIL-B', 'CORPORATE', 'SME', 'DIGITAL'];

export const SEED_PROVIDERS = ['Paystack', 'Flutterwave', 'Interswitch', 'Remita', 'Parkway'];

export const SEED_CATEGORIES: CategoryRecord[] = [
  { name: 'Payment Dispute', description: 'Transaction disputes and chargebacks' },
  { name: 'Technical Issue', description: 'System and integration failures' },
  { name: 'Account Issue', description: 'Account and profile problems' },
];

export const SEED_SLA_RULES: SlaRule[] = [
  { id: 'sla-1', category: 'Duplicate Debit', priority: TicketPriority.CRITICAL, durationHours: 4 },
  { id: 'sla-2', category: 'Duplicate Debit', priority: TicketPriority.HIGH, durationHours: 8 },
  { id: 'sla-3', category: 'Payment Dispute', priority: TicketPriority.MEDIUM, durationHours: 24 },
  { id: 'sla-4', category: 'Technical Issue', priority: TicketPriority.HIGH, durationHours: 12 },
  { id: 'sla-5', category: 'Gateway Timeout', priority: TicketPriority.CRITICAL, durationHours: 2 },
];

export const SEED_HOLIDAYS: HolidayRecord[] = [
  { id: 'hld-1', name: 'New Year Day', date: new Date(now + 30 * day).toISOString().split('T')[0] },
  { id: 'hld-2', name: 'Easter Monday', date: new Date(now + 90 * day).toISOString().split('T')[0] },
  { id: 'hld-3', name: 'Democracy Day', date: new Date(now + 120 * day).toISOString().split('T')[0] },
];

export const SEED_TEMPLATES: TicketTemplate[] = [
  { id: 'tmpl-1', name: 'Parkway Double Swipe', description: 'Customer charged twice on Parkway', category: 'Duplicate Debit', priority: TicketPriority.HIGH, provider: 'Parkway', amount: '', ticketDescription: 'Customer reports being charged twice for the same transaction. Transaction ID: [ID]. Amount: [AMOUNT]. Date: [DATE].' },
  { id: 'tmpl-2', name: 'Paystack Gateway Timeout', description: 'Payment gateway not responding', category: 'Gateway Timeout', priority: TicketPriority.CRITICAL, provider: 'Paystack', amount: '', ticketDescription: 'Payment gateway timeout occurred during transaction. Merchant: [MERCHANT]. Amount: [AMOUNT]. Timestamp: [TIME].' },
  { id: 'tmpl-3', name: 'Account Lockout', description: 'User locked out after failed attempts', category: 'Account Locked', priority: TicketPriority.MEDIUM, provider: 'General', amount: '', ticketDescription: 'User unable to login after [N] failed attempts. Email: [EMAIL]. Last successful login: [DATE].' },
];

export const SEED_KB_ARTICLES: KbArticle[] = [
  { id: 'kb-1', title: 'Parkway 504 Gateway Timeout — Remediation Playbook', category: 'Playbook', provider: 'General', content: '## Parkway 504 Gateway Timeout Remediation\n\n1. Verify Parkway status at status.stripe.com\n2. Check server firewall rules for outbound traffic on port 443\n3. Restart the payment processing service\n4. Enable Parkway retry logic with exponential backoff\n5. Monitor for 15 minutes before escalating to DevOps\n\n**Contact:** DevOps Team (ext. 2201)', tags: ['parkway', 'gateway', 'timeout'], lastUpdated: new Date(now - 2 * day).toISOString() },
  { id: 'kb-2', title: 'Chargeback Dispute Handling Workflow', category: 'Playbook', provider: 'General', content: '## Chargeback Dispute Process\n\n1. Receive chargeback notification from bank\n2. Gather transaction evidence (receipt, IP logs, device fingerprint)\n3. Submit rebuttal letter within 7 days\n4. Track dispute status weekly\n5. Escalate to legal if amount > ₦500,000', tags: ['chargeback', 'dispute', 'rebuttal'], lastUpdated: new Date(now - 5 * day).toISOString() },
];

export const SEED_SAVED_REPLIES: string[] = [
  'We have identified a gateway communication timeout on our provider end. Initiating reconciliation check.',
  'The transaction settlement delay has been resolved. Funds should reflect within 24-48 hours.',
  'This charge has been flagged as a duplicate. We are initiating an automated reversal via API.',
];

export const SEED_CUSTOMERS: CustomerRecord[] = [
  { id: 'cust-seed-1', firstName: 'Faith', lastName: 'Adeleke', email: 'faith@example.com', phone: '+234-806-000-6006', businessUnit: 'POSSAP', createdAt: new Date(now - 90 * day).toISOString(), totalTickets: 3 },
  { id: 'cust-seed-2', firstName: 'Bayo', lastName: 'Ogunlade', email: 'bayo@example.com', phone: '+234-807-000-7007', businessUnit: 'RETAIL-B', createdAt: new Date(now - 60 * day).toISOString(), totalTickets: 1 },
  { id: 'cust-seed-3', firstName: 'Ngozi', lastName: 'Eze', email: 'ngozi@example.com', phone: '+234-808-000-8008', businessUnit: 'CORPORATE', createdAt: new Date(now - 180 * day).toISOString(), totalTickets: 5 },
];

export const getSeedTickets = (): TicketRecord[] => [
  {
    id: 'TKT-2407-001', customerName: 'Faith Adeleke', customerEmail: 'faith@example.com',
    businessUnit: 'POSSAP', provider: 'Paystack',
    category: 'Payment Dispute',
    priority: TicketPriority.HIGH, status: TicketStatus.INVESTIGATE,
    amount: 45000, transactionId: 'TXN-20240715-8942',
    description: 'Double charge on POS transaction — customer was billed twice for a single purchase of ₦45,000 at ShopRite Ikeja.',
    createdAt: new Date(now - 2 * day).toISOString(),
    slaDeadline: new Date(now + 6 * day).toISOString(),
    isEscalated: false, escalationCount: 0,
    assignedAgentId: 'Emeka Nwosu',
    majorIncidentId: null, feedbackScore: null, feedbackComment: null,
    submittedBy: 'BU_SUPPORT', submittedByName: 'Sarah Okafor',
  },
  {
    id: 'TKT-2407-002', customerName: 'Bayo Ogunlade', customerEmail: 'bayo@example.com',
    businessUnit: 'RETAIL-B', provider: 'Flutterwave',
    category: 'Technical Issue',
    priority: TicketPriority.CRITICAL, status: TicketStatus.INVESTIGATE,
    amount: 15000, transactionId: 'TXN-20240716-1234',
    description: 'Payment gateway timeout during subscription renewal — customer unable to complete ₦15,000 monthly subscription payment.',
    createdAt: new Date(now - 1 * day).toISOString(),
    slaDeadline: new Date(now + 0.5 * day).toISOString(),
    isEscalated: true, escalationCount: 1,
    assignedAgentId: 'Sarah Okafor',
    majorIncidentId: 'MI-2024-001', feedbackScore: null, feedbackComment: null,
    submittedBy: 'PARTNER', submittedByName: 'Chioma Adebayo',
  },
  {
    id: 'TKT-2407-003', customerName: 'Ngozi Eze', customerEmail: 'ngozi@example.com',
    businessUnit: 'CORPORATE', provider: 'Interswitch',
    category: 'Payment Dispute',
    priority: TicketPriority.MEDIUM, status: TicketStatus.RESOLVED,
    amount: 230000, transactionId: 'TXN-20240705-6711',
    description: 'Customer disputes ₦230,000 transaction — claims unauthorized use of debit card.',
    createdAt: new Date(now - 10 * day).toISOString(),
    slaDeadline: new Date(now - 2 * day).toISOString(),
    isEscalated: false, escalationCount: 0,
    assignedAgentId: 'Adaobi Okeke',
    majorIncidentId: null, feedbackScore: 4, feedbackComment: 'Resolved promptly with full refund.',
    submittedBy: 'BU_SUPPORT', submittedByName: 'Sarah Okafor',
    rootCause: 'Card details compromised via phishing',
    correctiveAction: 'Full reversal processed and card blocked',
    rcaDetails: {
      rootCause: 'Card details compromised via phishing',
      contributingFactors: 'Customer entered card details on fake merchant site',
      correctiveActions: 'Full reversal processed and card blocked',
      preventiveActions: 'Customer advised on card security best practices',
      preventiveOwner: 'Adaobi Okeke',
      preventiveDueDate: new Date(now + 14 * day).toISOString().split('T')[0],
      resolvedAt: new Date(now - 3 * day).toISOString(),
      resolvedBy: 'Adaobi Okeke',
    },
  },
  {
    id: 'TKT-2407-004', customerName: 'Kola Adetokunbo', customerEmail: 'kola@example.com',
    businessUnit: 'DIGITAL', provider: 'Remita',
    category: 'Account Issue',
    priority: TicketPriority.MEDIUM, status: TicketStatus.RECEIPT,
    amount: 0, transactionId: 'TXN-20240720-5581',
    description: 'Customer reports an unidentified debit on their corporate account — pending intake and agent assignment.',
    createdAt: new Date(now - 0.2 * day).toISOString(),
    slaDeadline: new Date(now + 1 * day).toISOString(),
    isEscalated: false, escalationCount: 0,
    assignedAgentId: '',
    majorIncidentId: null, feedbackScore: null, feedbackComment: null,
    submittedBy: 'BU_SUPPORT', submittedByName: 'Sarah Okafor',
  },
  {
    id: 'TKT-2407-005', customerName: 'Amina Bello', customerEmail: 'amina@example.com',
    businessUnit: 'SME', provider: 'Paystack',
    category: 'Payment Dispute',
    priority: TicketPriority.HIGH, status: TicketStatus.ASSIGNED,
    amount: 120000, transactionId: 'TXN-20240719-3390',
    description: 'Customer charged twice for a ₦120,000 invoice — ticket assigned to Paystack provider team for review.',
    createdAt: new Date(now - 0.5 * day).toISOString(),
    slaDeadline: new Date(now + 2 * day).toISOString(),
    isEscalated: false, escalationCount: 0,
    assignedAgentId: 'Paystack Provider Team',
    majorIncidentId: null, feedbackScore: null, feedbackComment: null,
    submittedBy: 'PARTNER', submittedByName: 'Chioma Adebayo',
  },
  {
    id: 'TKT-2407-006', customerName: 'Ibrahim Musa', customerEmail: 'ibrahim@example.com',
    businessUnit: 'RETAIL-B', provider: 'Parkway',
    category: 'Payment Dispute',
    priority: TicketPriority.MEDIUM, status: TicketStatus.CLOSED,
    amount: 85000, transactionId: 'TXN-20240630-2204',
    description: 'Duplicate charge on Parkway card — fully reversed and closed after customer verification.',
    createdAt: new Date(now - 20 * day).toISOString(),
    slaDeadline: new Date(now - 12 * day).toISOString(),
    isEscalated: false, escalationCount: 0,
    assignedAgentId: 'Adaobi Okeke',
    majorIncidentId: null, feedbackScore: 5, feedbackComment: 'Refund received and verified.',
    submittedBy: 'BU_SUPPORT', submittedByName: 'Sarah Okafor',
    rootCause: 'Duplicate charge from double swipe',
    correctiveAction: 'Automatic reversal executed via API',
    rcaDetails: {
      rootCause: 'Duplicate charge from double swipe',
      contributingFactors: 'Merchant terminal retry sent duplicate authorization',
      correctiveActions: 'Automatic reversal executed via API',
      preventiveActions: 'Merchant terminal firmware updated',
      preventiveOwner: 'Parkway Engineering',
      preventiveDueDate: new Date(now + 7 * day).toISOString().split('T')[0],
      resolvedAt: new Date(now - 15 * day).toISOString(),
      resolvedBy: 'Adaobi Okeke',
    },
  },
];

export const SEED_COMMENTS: CommentRecord[] = [
  {
    id: 'cmt-seed-1', ticketId: 'TKT-2407-001',
    author: 'Emeka Nwosu', role: 'Provider',
    message: 'Checking Paystack logs for this transaction. Will update shortly.',
    timestamp: new Date(now - 1.5 * day).toISOString(),
    isInternal: false, seen: true,
  },
  {
    id: 'cmt-seed-2', ticketId: 'TKT-2407-002',
    author: 'Sarah Okafor', role: 'BU Support',
    message: 'Escalated to Flutterwave NOC team. Incident MI-2024-001 has been declared.',
    timestamp: new Date(now - 0.8 * day).toISOString(),
    isInternal: false, seen: true,
  },
  {
    id: 'cmt-seed-3', ticketId: 'TKT-2407-003',
    author: 'Adaobi Okeke', role: 'Super Admin',
    message: 'Chargeback rebuttal submitted to Interswitch. Awaiting bank confirmation.',
    timestamp: new Date(now - 5 * day).toISOString(),
    isInternal: false, seen: true,
  },
];

export const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud-seed-1', timestamp: new Date(now - 2 * day).toISOString(),
    ticketId: 'TKT-2407-001', actor: 'Sarah Okafor', role: 'BU_SUPPORT',
    action: 'CREATED_TICKET', details: 'Ticket created via customer call intake.',
  },
  {
    id: 'aud-seed-2', timestamp: new Date(now - 1 * day).toISOString(),
    ticketId: 'TKT-2407-002', actor: 'Chioma Adebayo', role: 'PARTNER',
    action: 'SUBMITTED_TICKET', details: 'Ticket submitted via partner portal.',
  },
  {
    id: 'aud-seed-3', timestamp: new Date(now - 10 * day).toISOString(),
    ticketId: 'TKT-2407-003', actor: 'Sarah Okafor', role: 'BU_SUPPORT',
    action: 'CREATED_TICKET', details: 'Ticket created from email complaint.',
  },
];

export const getSeedMajorIncidents = (): MajorIncidentRecord[] => [
  {
    id: 'MI-2024-001', name: 'Paystack Widespread Outage',
    description: 'Nationwide Paystack payment gateway outage affecting 200+ merchants. All payment processing halted.',
    provider: 'Paystack', category: 'Payment Gateway Integration',
    severity: 'CRITICAL', active: true, ticketCount: 3,
    createdAt: new Date(now - 6 * day).toISOString(),
    status: 'IDENTIFIED',
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
    provider: 'Parkway', category: 'Software Bug',
    severity: 'HIGH', active: false, ticketCount: 1,
    createdAt: new Date(now - 60 * day).toISOString(),
    status: 'RESOLVED',
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
