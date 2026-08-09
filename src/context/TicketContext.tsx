import { createContext, useContext, useState, useCallback, useEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import {
  TicketStatus,
  TicketPriority,
  UserRole,
  type TicketRecord,
  type CommentRecord,
  type AuditLog,
  type WatcherNotification,
  type MajorIncidentRecord,
  type FileEvidence,
} from '../types/app';
import { computeAuditHash } from '../lib/compliance';
import { syncAudit, syncNotification, syncTicketPatch, syncCreateTicket } from '../lib/sync';
import { calculateSlaDeadline } from '../lib/slaCalculator';
import { nextTicketId } from '../lib/buCodes';
import {
  applyTransition,
  getAvailableTransitions,
  isTerminal,
  normalizeStatus,
  type TransitionRule,
  TransitionError,
} from '../lib/ticketStateMachine';
import type { AppShellDomain } from './AppShellContext';
import type { AdminDomain } from './AdminContext';

export interface TicketDomain {
  tickets: TicketRecord[];
  setTickets: Dispatch<SetStateAction<TicketRecord[]>>;
  comments: CommentRecord[];
  setComments: Dispatch<SetStateAction<CommentRecord[]>>;
  auditLogs: AuditLog[];
  setAuditLogs: Dispatch<SetStateAction<AuditLog[]>>;
  watcherNotifications: WatcherNotification[];
  setWatcherNotifications: Dispatch<SetStateAction<WatcherNotification[]>>;
  evidence: FileEvidence[];
  setEvidence: Dispatch<SetStateAction<FileEvidence[]>>;
  majorIncidents: MajorIncidentRecord[];
  setMajorIncidents: Dispatch<SetStateAction<MajorIncidentRecord[]>>;
  logAuditAction: (ticketId: string | null, action: string, details: string) => Promise<void>;
  notifyWatchers: (ticket: TicketRecord, message: string, updatedTicketsList?: TicketRecord[]) => void;
  getTicketRisk: (t: TicketRecord) => { isAtRisk: boolean; riskScore: number; reason: string };
  getScopedTickets: (allTickets?: TicketRecord[]) => TicketRecord[];
  getAvailableTicketTransitions: (ticket: TicketRecord) => TransitionRule[];
  isTicketTerminal: (ticket: TicketRecord) => boolean;
  transitionTicket: (ticketId: string, toStatus: TicketStatus) => Promise<TicketRecord>;
  handleCreateTicket: (ticketData: Partial<TicketRecord>) => string;
}

export const TicketContext = createContext<TicketDomain | null>(null);

export function useTicketContext() {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error('useTicketContext must be used within TicketProvider');
  return ctx;
}

export function TicketProvider({ children, value }: { children: ReactNode; value: TicketDomain }) {
  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

interface TicketDomainDeps {
  shell: AppShellDomain;
  admin: AdminDomain;
  saveToStorage: (t?: TicketRecord[], c?: CommentRecord[], a?: AuditLog[], m?: MajorIncidentRecord[], wn?: WatcherNotification[], uList?: unknown[], sRules?: unknown[], hList?: unknown[], tTemplates?: unknown[], kArticles?: unknown[]) => void;
  showToast: (message: string, type?: 'success' | 'info' | 'error' | 'warning') => void;
}

export function useTicketDomain({ shell, admin, saveToStorage, showToast }: TicketDomainDeps): TicketDomain {
  const { currentUser, currentRole, activeTicketId } = shell;
  const { slaRules, holidays, businessUnitCodes } = admin;

  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [watcherNotifications, setWatcherNotifications] = useState<WatcherNotification[]>([]);
  const [evidence, setEvidence] = useState<FileEvidence[]>([]);
  const [majorIncidents, setMajorIncidents] = useState<MajorIncidentRecord[]>([]);

  // Initialize from localStorage only
  useEffect(() => {
    const load = <T,>(key: string, setter: Dispatch<SetStateAction<T>>) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          setter(JSON.parse(raw));
        } catch {
          // If parsing fails, keep existing state
        }
      }
    };
    load('4c_tickets', setTickets);
    load('4c_comments', setComments);
    load('4c_audit', setAuditLogs);
    load('4c_major_incidents', setMajorIncidents);
    load('4c_watcher_notifications', setWatcherNotifications);
    load('4c_evidence', setEvidence);
  }, []);

  // Log Immutable audits with hash chain
  const logAuditAction = useCallback(async (ticketId: string | null, action: string, details: string) => {
    const newLog: AuditLog = {
      id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      ticketId,
      actor: currentUser.firstName + ' ' + currentUser.lastName,
      role: currentRole,
      action,
      details
    };
    const previousHash = auditLogs.length > 0 ? auditLogs[0].hash : '';
    const entryWithHash: AuditLog = { ...newLog, previousHash, hash: '' };
    entryWithHash.hash = await computeAuditHash(entryWithHash);
    const updated = [entryWithHash, ...auditLogs];
    saveToStorage(tickets, comments, updated);
    setAuditLogs(updated);
    syncAudit({ ticketId, action, details });
  }, [currentUser, currentRole, tickets, comments, auditLogs, saveToStorage]);

  // Notify watchers
  const notifyWatchers = useCallback((ticket: TicketRecord, message: string, updatedTicketsList?: TicketRecord[]) => {
    const list = ticket.watchers || [];
    if (list.length === 0) {
      saveToStorage(updatedTicketsList || tickets, comments, auditLogs, majorIncidents);
      return;
    }
    const newNotifications: WatcherNotification[] = list.map(watcherEmail => ({
      id: 'wn-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      ticketId: ticket.id,
      message,
      recipient: watcherEmail,
      seen: false
    }));
    newNotifications.forEach(n => syncNotification(n));
    setWatcherNotifications(prev => {
      const updatedWN = [...newNotifications, ...prev];
      saveToStorage(updatedTicketsList || tickets, comments, auditLogs, majorIncidents, updatedWN);
      return updatedWN;
    });
  }, [tickets, comments, auditLogs, majorIncidents, saveToStorage]);

  // Authoritative, rule-gated ticket lifecycle transition.
  const getAvailableTicketTransitions = useCallback(
    (ticket: TicketRecord) => getAvailableTransitions(ticket, currentRole),
    [currentRole]
  );

  const isTicketTerminal = useCallback((ticket: TicketRecord) => isTerminal(ticket.status), []);

  const transitionTicket = useCallback(
    async (ticketId: string, toStatus: TicketStatus): Promise<TicketRecord> => {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

      const available = getAvailableTransitions(ticket, currentRole);
      if (!available.some(r => r.to === toStatus)) {
        const allowed = available.map(r => ({ to: r.to, label: r.label }));
        const err = new TransitionError(
          `Cannot move "${ticket.status}" → "${toStatus}" as ${currentRole}`,
          'NOT_ALLOWED',
          allowed
        );
        throw err;
      }

      const updated = applyTransition(ticket, toStatus, currentRole, {
        actor: currentUser.firstName + ' ' + currentUser.lastName,
      });
      const rule: TransitionRule | undefined = available.find(r => r.to === toStatus);

      setTickets(ts => ts.map(t => (t.id === ticketId ? updated : t)));
      if (activeTicketId === ticketId) shell.setActiveTicketId(ticketId);

      logAuditAction(
        ticketId,
        `TICKET_${rule?.event || 'STATUS_CHANGE'}`,
        rule ? `Status changed to ${toStatus} via ${rule.label}.` : `Status changed to ${toStatus}.`
      );
      void syncTicketPatch(ticketId, { status: toStatus });
      notifyWatchers(updated, `Ticket ${ticketId} status updated to ${toStatus}.`);

      return updated;
    },
    [tickets, currentRole, logAuditAction, notifyWatchers, activeTicketId, currentUser.firstName, currentUser.lastName, shell]
  );

  // SLA risk check
  const getTicketRisk = useCallback((t: TicketRecord) => {
    if (t.status === TicketStatus.CLOSED || t.status === TicketStatus.RESOLVED || t.isEscalated) {
      return { isAtRisk: false, riskScore: 0, reason: "" };
    }
    const hoursLeft = (new Date(t.slaDeadline).getTime() - Date.now()) / 3600000;
    const commentsCount = comments.filter(c => c.ticketId === t.id).length;

    let isAtRisk = false;
    let riskScore = 0;
    let reason = "";

    if (hoursLeft < 0) {
      return { isAtRisk: false, riskScore: 0, reason: "" };
    }

    if (hoursLeft < 3) {
      isAtRisk = true;
      riskScore = Math.min(99, 85 + Math.floor((3 - hoursLeft) * 5));
      reason = `Extremely tight SLA timeline (${hoursLeft.toFixed(1)} hours left) with low interaction velocity.`;
    } else if (hoursLeft < 6 && commentsCount < 2) {
      isAtRisk = true;
      riskScore = Math.min(85, 70 + (2 - commentsCount) * 8);
      reason = `Approaching breach threshold (<6h) with stagnant collaboration thread.`;
    } else if (t.priority === TicketPriority.CRITICAL && hoursLeft < 8 && commentsCount < 3) {
      isAtRisk = true;
      riskScore = 75;
      reason = `Critical severity case with low engagement velocity.`;
    }

    return { isAtRisk, riskScore, reason };
  }, [comments]);

  // Tenant data isolation filter
  const getScopedTickets = useCallback((allTickets?: TicketRecord[]) => {
    const source = allTickets || tickets;
    if (currentRole === UserRole.SUPER_ADMIN || currentRole === UserRole.EXECUTIVE) {
      return source;
    }
  if (currentRole === UserRole.PROVIDER) {
    const bu = currentUser.bu.toLowerCase();
    return source.filter(t => {
      const provider = t.provider.toLowerCase();
      const agent = t.assignedAgentId?.toLowerCase() || '';
      return (
        provider === bu ||
        agent === bu ||
        agent.startsWith(bu + ' ')
      );
    });
  }
    return source.filter(t => t.businessUnit === currentUser.bu);
  }, [currentRole, currentUser.bu, tickets]);

  // Create ticket helper
  const handleCreateTicket = useCallback((ticketData: Partial<TicketRecord>): string => {
    const tId = ticketData.id || nextTicketId(
      ticketData.businessUnit || currentUser.bu,
      Object.keys(businessUnitCodes).map((name) => ({ name, code: businessUnitCodes[name] })),
      tickets.map((t) => t.id)
    );
    const deadlineDate = calculateSlaDeadline(
      new Date(),
      ticketData.category || 'Failed Payment',
      (ticketData.priority as TicketPriority) || TicketPriority.HIGH,
      slaRules,
      holidays
    );
    const record: TicketRecord = {
      id: tId,
      customerName: ticketData.customerName || '',
      customerEmail: ticketData.customerEmail || '',
      customerPhone: ticketData.customerPhone,
      customerLastName: ticketData.customerLastName,
      customerId: ticketData.customerId,
      businessUnit: ticketData.businessUnit || currentUser.bu,
      provider: ticketData.provider || 'Parkway',
      category: ticketData.category || 'Failed Payment',
      priority: (ticketData.priority as TicketPriority) || TicketPriority.HIGH,
      status: TicketStatus.ASSIGNED,
      amount: ticketData.amount || 0,
      transactionId: ticketData.transactionId || 'TXN_' + Date.now(),
      description: ticketData.description || '',
      createdAt: new Date().toISOString(),
      slaDeadline: deadlineDate.toISOString(),
      isEscalated: false,
      escalationCount: 0,
      assignedAgentId: `${ticketData.provider || 'Parkway'} Provider Team`,
      majorIncidentId: null,
      feedbackScore: null,
      feedbackComment: null,
      watchers: [],
      submittedBy: ticketData.submittedBy || 'BU_SUPPORT',
      submittedByName: ticketData.submittedByName,
      submittedByPhone: ticketData.submittedByPhone,
    };
    setTickets(prev => [record, ...prev]);
    const newAudit: AuditLog = {
      id: 'aud-' + Date.now(),
      timestamp: new Date().toISOString(),
      ticketId: tId,
      actor: currentUser.firstName + ' ' + currentUser.lastName,
      role: currentRole,
      action: 'CREATED_TICKET',
      details: `Ticket ${tId} created for ${record.customerName} (${record.submittedBy === 'BU_SUPPORT' ? 'self-submitted' : 'customer-submitted'})`
    };
    const assignedAudit: AuditLog = {
      id: 'aud-' + Date.now() + '-a',
      timestamp: new Date().toISOString(),
      ticketId: tId,
      actor: currentUser.firstName + ' ' + currentUser.lastName,
      role: currentRole,
      action: 'TICKET_ASSIGNED',
      details: `Ticket ${tId} auto-assigned to ${record.assignedAgentId} on intake.`
    };
    setAuditLogs(prev => [assignedAudit, newAudit, ...prev]);
    saveToStorage([record, ...tickets], comments, [assignedAudit, newAudit, ...auditLogs]);
    syncCreateTicket(record);
    showToast(`Ticket ${tId} created.`, 'success');
    return tId;
  }, [currentUser, currentRole, slaRules, holidays, businessUnitCodes, tickets, comments, auditLogs, saveToStorage, showToast]);

  const value: TicketDomain = {
    tickets, setTickets,
    comments, setComments,
    auditLogs, setAuditLogs,
    watcherNotifications, setWatcherNotifications,
    evidence, setEvidence,
    majorIncidents, setMajorIncidents,
    logAuditAction,
    notifyWatchers,
    getTicketRisk,
    getScopedTickets,
    getAvailableTicketTransitions,
    isTicketTerminal,
    transitionTicket,
    handleCreateTicket,
  };

  return value;
}
