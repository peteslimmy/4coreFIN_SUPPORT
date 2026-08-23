export enum TicketStatus {
  RECEIPT = 'RECEIPT',
  ASSIGNED = 'ASSIGNED',
  INVESTIGATE = 'INVESTIGATE',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  WAITING_PARTNER = 'WAITING_PARTNER',
  WAITING_INTERNAL = 'WAITING_INTERNAL'
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum UserRole {
  BU_SUPPORT = 'BU_SUPPORT',
  BU_SUPPORT_L1 = 'BU_SUPPORT_L1',
  BU_SUPPORT_L2 = 'BU_SUPPORT_L2',
  BU_SUPPORT_L3 = 'BU_SUPPORT_L3',
  PARTNER = 'PARTNER',
  EXECUTIVE = 'EXECUTIVE',
  SUPER_ADMIN = 'SUPER_ADMIN',
  CUSTOMER = 'CUSTOMER'
}

export interface TicketRecord {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerLastName?: string;
  customerId?: string;
  businessUnit: string;
  partner: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  amount: number;
  transactionId: string;
  description: string;
  createdAt: string;
  slaDeadline: string;
  /** Accumulated SLA pause time (ms) across waiting episodes. */
  slaPausedMs?: number;
  /** Set while the ticket waits (WAITING_*); cleared on resume. */
  slaPauseStartedAt?: string | null;
  isEscalated: boolean;
  escalationCount: number;
  assignedAgentId: string;
  majorIncidentId: string | null;
  feedbackScore: number | null;
  feedbackComment: string | null;
  bankName?: string;
  rootCause?: string;
  correctiveAction?: string;
  watchers?: string[];
  isDeleted?: boolean;
  submittedBy: 'BU_SUPPORT' | 'CUSTOMER';
  submittedByName?: string;
  submittedByPhone?: string;
  customFields?: Record<string, string | number | boolean>;
  duplicateOf?: string;
  rcaDetails?: {
    rootCause: string;
    contributingFactors: string;
    correctiveActions: string;
    preventiveActions: string;
    preventiveOwner: string;
    preventiveDueDate: string;
    resolvedAt?: string;
    resolvedBy?: string;
  };
}

export interface CustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  businessUnit: string;
  createdAt: string;
  totalTickets: number;
  notes?: string;
}

export const MAJOR_INCIDENT_STATUS_ORDER = ['DECLARED', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED'] as const;
export type MajorIncidentStatus = typeof MAJOR_INCIDENT_STATUS_ORDER[number];

export interface MajorIncidentRecord {
  id: string;
  name: string;
  description: string;
  partner: string;
  category: string;
  severity: string;
  active: boolean;
  ticketCount: number;
  createdAt: string;
  status: MajorIncidentStatus | 'MITIGATED';
  tenantId?: string;
  owner?: { id?: string; name: string; role: string };
  declaredBy?: { name: string; role: string };
  affectedPartners?: string[];
  affectedBus?: string[];
  impact?: { description: string; customerCount?: string; amount?: string };
  expectedRto?: string | null;
  severityJustification?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  timeline: Array<{
    id: string;
    timestamp: string;
    author: string;
    role: string;
    message: string;
  }>;
  notifications: Array<{
    id: string;
    timestamp: string;
    channel: string;
    recipient: string;
    subject: string;
    status: 'SENT' | 'FAILED' | 'QUEUED';
    error?: string;
  }>;
  pir?: {
    rootCauseSummary: string;
    timelineSummary: string;
    impactSummary: string;
    preventiveOwner: string;
    preventiveDueDate: string;
    draft: boolean;
    lastUpdated: string;
    lastUpdatedBy: string;
  };
}

export interface AuditLog {
  id: string;
  timestamp: string;
  ticketId: string | null;
  actor: string;
  role: string;
  event?: string | null;
  action: string;
  details: string;
  hash?: string;
  previousHash?: string;
}

export interface WatcherNotification {
  id: string;
  timestamp: string;
  ticketId: string;
  message: string;
  recipient: string;
  seen: boolean;
}

export interface FileEvidence {
  id: string;
  ticketId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  uploadedBy: string;
  dataUrl?: string;
  url?: string;
}

export interface CommentRecord {
  id: string;
  ticketId: string;
  author: string;
  role: string;
  message: string;
  timestamp: string;
  authorEmail?: string;
  isInternal: boolean;
  seen: boolean;
  parentCommentId?: string;
  seenBy?: string[];
}
