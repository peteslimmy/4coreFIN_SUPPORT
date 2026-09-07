import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Info, FileText, AlertTriangle, CheckCircle2, Bot, RefreshCw, MessageSquare, Paperclip, Zap, ArrowRightLeft } from "lucide-react";
import { TicketRecord, AuditLog, CommentRecord } from "../../types/app";
import { useApp } from "../../context/AppContext";
import { relativeTime } from "../../lib/dateUtils";

interface AuditPanelProps {
  ticket: TicketRecord;
}

const TICKET_AUDIT_ACTIONS = new Set([
  'TICKET_CREATED', 'TICKET_TRANSITION', 'TICKET_ESCALATED',
  'TICKET_FEEDBACK', 'TICKET_DELETED', 'TICKET_MERGED', 'TICKET_UPDATED',
  'COMMENT_ADDED', 'COMMENT_UPDATED',
  'EVIDENCE_UPLOADED', 'EVIDENCE_DELETED',
]);

function getEventStyle(action: string): { icon: React.ElementType; dot: string; text: string } {
  const a = action.toUpperCase();
  if (a.includes("TRANSITION") || a.includes("STATUS")) {
    return { icon: ArrowRightLeft, dot: "bg-info", text: "text-info" };
  }
  if (a.includes("ESCALAT") || a.includes("MAJOR")) {
    return { icon: AlertTriangle, dot: "bg-warning", text: "text-warning" };
  }
  if (a.includes("RESOLVED") || a.includes("CLOSED") || a.includes("ACCEPTED")) {
    return { icon: CheckCircle2, dot: "bg-success", text: "text-success" };
  }
  if (a.includes("CREATED") || a.includes("MERGED")) {
    return { icon: FileText, dot: "bg-primary", text: "text-primary" };
  }
  if (a.includes("COMMENT")) {
    return { icon: MessageSquare, dot: "bg-accent", text: "text-accent" };
  }
  if (a.includes("EVIDENCE") || a.includes("UPLOAD")) {
    return { icon: Paperclip, dot: "bg-info", text: "text-info" };
  }
  if (a.includes("RCA") || a.includes("AUTO")) {
    return { icon: Bot, dot: "bg-primary/10", text: "text-primary-dark" };
  }
  return { icon: Info, dot: "bg-border", text: "text-text-muted" };
}

interface TimelineEvent {
  type: 'audit' | 'comment';
  id: string;
  timestamp: string;
  action: string;
  details: string;
  actor: string;
  icon: React.ElementType;
  dot: string;
  text: string;
}

const TRANSITION_PATTERNS: Array<[RegExp, string]> = [
  [/to\s+ASSIGNED/i, 'Assigned'],
  [/to\s+INVESTIGATE/i, 'In Review'],
  [/to\s+WAITING_CUSTOMER/i, 'Waiting for Customer'],
  [/to\s+WAITING_PARTNER/i, 'Waiting for Partner'],
  [/to\s+WAITING_INTERNAL/i, 'Waiting Internal'],
  [/to\s+RESOLVED/i, 'Resolved'],
  [/to\s+CLOSED/i, 'Closed'],
];

function eventSummary(ev: TimelineEvent): string {
  if (ev.action === 'TICKET_TRANSITION') {
    const match = TRANSITION_PATTERNS.find(([re]) => re.test(ev.details));
    if (match) return `Status changed to ${match[1]}`;
    if (/from\s+(\S+)\s+to\s+(\S+)/.test(ev.details)) {
      const m = ev.details.match(/from\s+(\S+)\s+to\s+(\S+)/)!;
      return `Status changed: ${m[1]} → ${m[2]}`;
    }
    return 'Status changed';
  }
  if (ev.action === 'TICKET_CREATED') return 'Ticket submitted';
  if (ev.type === 'comment') {
    const preview = ev.details.replace(/\s+/g, ' ').trim().slice(0, 60);
    return `Message${ev.actor ? ` from ${ev.actor}` : ''}${preview ? `: ${preview}` : ''}`;
  }
  return ev.details.slice(0, 60) + (ev.details.length > 60 ? '…' : '');
}

export function AuditPanel({ ticket }: AuditPanelProps) {
  const { auditLogs, comments, users, showToast } = useApp();
  const [viewMode, setViewMode] = useState<'timeline' | 'detailed'>('timeline');

  const ticketEvents = useMemo<TimelineEvent[]>(() => {
    if (!ticket) return [];

    const auditEvents: TimelineEvent[] = (auditLogs || [])
      .filter((log: AuditLog) => log.ticketId === ticket.id
        && TICKET_AUDIT_ACTIONS.has(log.action)
        && !log.action.startsWith('COMMENT_'))
      .map(log => {
        const style = getEventStyle(log.action);
        return {
          type: 'audit' as const,
          id: log.id,
          timestamp: log.timestamp,
          action: log.action,
          details: log.details,
          actor: log.actor,
          icon: style.icon,
          dot: style.dot,
          text: style.text,
        };
      });

    const commentEvents: TimelineEvent[] = (comments || [])
      .filter((c: CommentRecord) => c.ticketId === ticket.id)
      .map(c => ({
        type: 'comment' as const,
        id: 'msg-' + c.id,
        timestamp: c.timestamp,
        action: 'COMMENT_ADDED',
        details: c.message,
        actor: c.author,
        icon: MessageSquare,
        dot: 'bg-accent',
        text: 'text-accent',
      }));

    return [...auditEvents, ...commentEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [ticket, auditLogs, comments]);

  const userNameOf = (ev: TimelineEvent) => {
    const user = users.find(u => u.email === ev.actor);
    return user ? user.firstName + " " + user.lastName : ev.actor || "System";
  };

  if (!ticket) {
    return (
      <section className="solid-surface rounded-xl p-6 text-center snap-start min-w-[320px] flex-shrink-0">
        <Info className="w-8 h-8 text-text-muted mx-auto mb-3" />
        <p className="text-xs font-semibold text-text-muted">Select a ticket to view audit trail</p>
      </section>
    );
  }

  return (
    <section className="solid-surface rounded-xl p-4 snap-start min-w-[320px] flex-shrink-0">
      <div className="flex items-center justify-between pb-2 border-b border-border mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Audit Trail</h3>
          <span className="text-[9px] font-medium text-text-muted">{ticketEvents.length} events</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setViewMode('timeline')} aria-pressed={viewMode === 'timeline'} className={`px-2 py-1 rounded text-[9px] font-medium transition-colors focus-ring ${viewMode === 'timeline' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover'}`}>Timeline</button>
          <button onClick={() => setViewMode('detailed')} aria-pressed={viewMode === 'detailed'} className={`px-2 py-1 rounded text-[9px] font-medium transition-colors focus-ring ${viewMode === 'detailed' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover'}`}>Detailed</button>
        </div>
      </div>

      {ticketEvents.length === 0 ? (
        <div className="text-center py-4">
          <Info className="w-6 h-6 text-text-muted mx-auto mb-2" />
          <p className="text-[9px] text-text-muted">No audit events for this ticket</p>
        </div>
      ) : viewMode === 'timeline' ? (
        <ol className="space-y-3">
          {ticketEvents.map((ev, index) => {
            const Icon = ev.icon;
            return (
              <motion.li
                key={ev.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4), ease: 'easeOut' }}
                className="flex items-start gap-2.5"
              >
                <div className="flex flex-col items-center shrink-0 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${ev.dot}`} />
                  {index < ticketEvents.length - 1 && (
                    <span className="w-0.5 h-6 bg-border mt-0.5 rounded" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-semibold text-text-primary truncate" title={new Date(ev.timestamp).toLocaleString()}>
                      <Icon className={`w-3 h-3 inline mr-1 -mt-0.5 ${ev.text}`} />
                      {eventSummary(ev)}
                    </p>
                    <span className="text-[9px] text-text-muted shrink-0">{relativeTime(ev.timestamp)}</span>
                  </div>
                  <p className="text-[9px] text-text-muted">{ev.action} · {userNameOf(ev)}</p>
                </div>
              </motion.li>
            );
          })}
        </ol>
      ) : (
        <div className="divide-y divide-border-subtle">
          {ticketEvents.map(ev => {
            const Icon = ev.icon;
            return (
              <div key={ev.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${ev.text}`} />
                    <span className="font-mono text-[10px] font-semibold text-text-primary truncate">{ev.action}</span>
                  </div>
                  <span className="text-[9px] text-text-muted shrink-0" title={new Date(ev.timestamp).toLocaleString()}>{new Date(ev.timestamp).toLocaleString()}</span>
                </div>
                <dl className="ml-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[9px]">
                  <dt className="font-semibold text-text-muted uppercase tracking-wide">Actor</dt>
                  <dd className="text-text-secondary truncate">{userNameOf(ev)}</dd>
                  <dt className="font-semibold text-text-muted uppercase tracking-wide">Details</dt>
                  <dd className="text-text-secondary break-words whitespace-pre-wrap">{eventSummary(ev)}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
        <span className="text-[9px] text-text-muted flex items-center gap-1"><Zap className="w-3 h-3" /> Immutable audit record</span>
        <button onClick={() => showToast('Audit trail refreshed.', 'success')} className="text-[9px] font-medium text-primary hover:text-primary-dark hover:underline focus-ring"><RefreshCw className="w-3 h-3 inline mr-1" /> Refresh</button>
      </div>
    </section>
  );
}