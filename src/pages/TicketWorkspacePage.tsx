import React, { useState, useEffect } from 'react';
import { Ticket } from 'lucide-react';

import PageTransition from '../components/layout/PageTransition';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import type { CommentRecord, WatcherNotification, AuditLog } from '../types/app';
import { TicketStatus, TicketPriority } from '../types/app';
import { useApp } from '../context/AppContext';
import { syncComment, syncNotification } from '../lib/sync';
import { isAddressed, applyMention, mentionCandidates, resolveMention } from '../lib/mention';
import TicketListPane from './ticket-workspace/TicketListPane';
import TicketDetailPane from './ticket-workspace/TicketDetailPane';
import ActivityPanel from './ticket-workspace/ActivityPanel';
import EscalationModals from './ticket-workspace/EscalationModals';
import NewTicketModal, { type NewTicketFormState } from './ticket-workspace/NewTicketModal';

interface TicketWorkspacePageProps {
  handleDeclareMajorIncident: (formData?: { name: string; description: string; provider: string; category: string; severity: string; initialNotification: string }) => void;
}

function TicketWorkspacePage({ handleDeclareMajorIncident }: TicketWorkspacePageProps) {
  const {
    isLoading,
    activeTicketId, setActiveTicketId,
    tickets, setTickets, comments, setComments,
    auditLogs, setAuditLogs,
    watcherNotifications, setWatcherNotifications,
    majorIncidents,
    currentRole, currentUser,
    logAuditAction, saveToStorage, showToast,
    commentText, setCommentText, notifyWatchers,
    evidence,
    handleCreateTicket, users,
    slaRules, holidays, ticketTemplates, kbArticles,
  } = useApp();

  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [removeWatcherConfirm, setRemoveWatcherConfirm] = useState<string | null>(null);
  const [newWatcherEmail, setNewWatcherEmail] = useState('');
  const [notifyWatcherModal, setNotifyWatcherModal] = useState<{ isOpen: boolean; watcherEmail: string | null }>({ isOpen: false, watcherEmail: null });
  const [selectedWatcherIds, setSelectedWatcherIds] = useState<Set<string>>(new Set());
  const [rcaForm, setRcaForm] = useState({ rootCause: '', contributingFactors: '', correctiveActions: '', preventiveActions: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedbackInput, setFeedbackInput] = useState({ score: 5, comment: '' });
  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [isRcaGenerating, setIsRcaGenerating] = useState(false);
  const [showDeclareResolution, setShowDeclareResolution] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [showMobileTicketList, setShowMobileTicketList] = useState(false);
  const [, setShowMobileActivity] = useState(false);
  const [directMessageText, setDirectMessageText] = useState('');
  const [showNewTicketPanel, setShowNewTicketPanel] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState<NewTicketFormState>({ customerName: '', customerEmail: '', customerPhone: '', customerId: undefined, provider: '', category: '', priority: TicketPriority.HIGH, amount: '', transactionId: '', description: '' });
  const [newTicketErrors, setNewTicketErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const activeTicket = tickets.find(t => t.id === activeTicketId) || null;
  const slaCountdown = activeTicket ? (() => {
    const diff = new Date(activeTicket.slaDeadline).getTime() - now;
    if (diff <= 0) return 'SLA Breached';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m remaining`;
  })() : '';

  const clearError = (field: string) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  const clearFormErrors = () => setFormErrors({});

  const handleBeginInvestigation = () => {
    if (!activeTicket) return;
    const updated = { ...activeTicket, status: TicketStatus.INVESTIGATE as TicketStatus };
    setTickets(ts => ts.map(t => t.id === activeTicket.id ? updated : t));
    saveToStorage(tickets.map(t => t.id === activeTicket.id ? updated : t), comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(activeTicket.id, 'STATUS_CHANGED', 'Status changed to INVESTIGATING');
    showToast('Investigation started.', 'success');
  };

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    const updated = { ...activeTicket, status: TicketStatus.RESOLVED as TicketStatus };
    setTickets(ts => ts.map(t => t.id === activeTicket.id ? updated : t));
    saveToStorage(tickets.map(t => t.id === activeTicket.id ? updated : t), comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(activeTicket.id, 'STATUS_CHANGED', 'Status changed to RESOLVED');
    showToast('Ticket resolved.', 'success');
  };

  const handleResolutionResponse = (accept: boolean) => {
    if (!activeTicket) return;
    const status = accept ? TicketStatus.CLOSED : TicketStatus.INVESTIGATE;
    const updated = { ...activeTicket, status };
    setTickets(ts => ts.map(t => t.id === activeTicket.id ? updated : t));
    saveToStorage(tickets.map(t => t.id === activeTicket.id ? updated : t), comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(activeTicket.id, 'RESOLUTION_' + (accept ? 'ACCEPTED' : 'REJECTED'), '');
    showToast(accept ? 'Resolution accepted.' : 'Resolution rejected.', accept ? 'success' : 'info');
  };

  const handleAiGenerateRca = async () => {
    if (!activeTicket) return;
    setIsRcaGenerating(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      setRcaForm({ rootCause: 'System overload during peak hours.', contributingFactors: 'Database connection pool exhaustion.', correctiveActions: 'Added connection pool monitoring and auto-scaling.', preventiveActions: 'Review capacity quarterly and add circuit breakers.' });
      showToast('RCA generated successfully.', 'success');
    } finally {
      setIsRcaGenerating(false);
    }
  };

  const handleManualEscalate = async () => {
    if (!activeTicket) return;
    if (!escalationReason.trim()) { setFormErrors({ escalationReason: 'Escalation reason is required.' }); return; }
    const updated = { ...activeTicket, priority: TicketPriority.CRITICAL };
    setTickets(ts => ts.map(t => t.id === activeTicket.id ? updated : t));
    saveToStorage(tickets.map(t => t.id === activeTicket.id ? updated : t), comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(activeTicket.id, 'ESCALATED', escalationReason);
    setShowEscalationModal(false);
    setEscalationReason('');
    showToast('Ticket escalated.', 'success');
  };

  const confirmEscalation = () => { setShowEscalationModal(false); setEscalationReason(''); };

  const handleMergeTicket = () => {
    if (!activeTicket) return;
    const target = prompt('Enter target ticket ID to merge into:');
    if (!target || target === activeTicket.id) return;
    const targetTicket = tickets.find(t => t.id === target);
    if (!targetTicket) { showToast('Target ticket not found.', 'error'); return; }
    const mergedComments = [...comments, { id: 'cm-' + Date.now(), ticketId: target, message: `Migrated from ${activeTicket.id}`, timestamp: new Date().toISOString(), author: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole, seen: false, isInternal: false } as CommentRecord];
    const mergeLog = { id: 'al-' + Date.now(), ticketId: target, action: 'TICKET_MERGED', details: `Merged ${activeTicket.id}`, timestamp: new Date().toISOString(), actor: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole } as AuditLog;
    const mergedAudits = [...auditLogs, mergeLog];
    const updatedTickets = tickets.filter(t => t.id !== activeTicket.id && t.id !== target);
    setTickets(updatedTickets);
    setComments(mergedComments);
    setAuditLogs(mergedAudits);
    saveToStorage(updatedTickets, mergedComments, mergedAudits, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(target, 'TICKET_MERGED', `Merged ${activeTicket.id}`);
    showToast('Tickets merged.', 'success');
    setActiveTicketId(target);
  };

  const handleSoftDeleteTicket = (id: string) => {
    if (archiveConfirmId !== id) { setArchiveConfirmId(id); return; }
    const updated = tickets.map(t => t.id === id ? { ...t, status: TicketStatus.CLOSED as TicketStatus } : t);
    setTickets(updated);
    saveToStorage(updated, comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(id, 'ARCHIVED', 'Ticket archived');
    showToast('Ticket archived.', 'success');
    setArchiveConfirmId(null);
    if (activeTicketId === id) setActiveTicketId(tickets.find(t => t.id !== id)?.id || null);
  };

  const handleDeclareMajorIncidentWrapper = () => {
    if (!activeTicket) return;
    handleDeclareMajorIncident({ name: activeTicket.id, description: activeTicket.description || '', provider: activeTicket.provider || '', category: activeTicket.category || '', severity: activeTicket.priority || '', initialNotification: '' });
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || !activeTicket || isSendingComment) return;
    if (!isAddressed(trimmed)) {
      setShowMentions(true);
      setMentionSearch("");
      setMentionIndex(0);
      showToast("Choose who to send this to.", "info");
      return;
    }
    performSend(trimmed);
  };

  const handleSendToEveryone = () => {
    const trimmed = commentText.trim();
    if (!trimmed || !activeTicket || isSendingComment) return;
    setShowMentions(false);
    performSend(trimmed);
  };

  const performSend = async (trimmed: string) => {
    if (!activeTicket) return;
    setIsSendingComment(true);
    try {
      const newComment: CommentRecord = { id: 'cm-' + Date.now(), ticketId: activeTicket.id, message: trimmed, timestamp: new Date().toISOString(), author: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole, seen: false, isInternal: false };
      const updatedComments = [...comments, newComment];
      setComments(updatedComments);
      setCommentText('');
      setReplyingTo(null);
      saveToStorage(tickets, updatedComments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
      const ok = await syncComment(newComment);
      if (!ok) {
        showToast('Comment stored locally but failed to sync to server.', 'error');
      } else {
        const mentioned = resolveMention(trimmed, users);
        if (mentioned && mentioned.email.toLowerCase() !== currentUser.email.toLowerCase()) {
          const direct: WatcherNotification = {
            id: 'wn-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            timestamp: new Date().toISOString(),
            ticketId: activeTicket.id,
            message: `@${mentioned.firstName} ${mentioned.lastName}, you were mentioned on ticket ${activeTicket.id}.`,
            recipient: mentioned.email,
            seen: false,
          };
          setWatcherNotifications(prev => {
            const updatedWN = [direct, ...prev];
            saveToStorage(tickets, updatedComments, auditLogs, majorIncidents, updatedWN, users, slaRules, holidays, ticketTemplates, kbArticles);
            return updatedWN;
          });
          syncNotification(direct);
          showToast(`Comment sent to ${mentioned.firstName} ${mentioned.lastName}.`, 'success');
        } else {
          notifyWatchers(activeTicket, `New comment on ticket ${activeTicket.id}`);
          showToast('Comment sent.', 'success');
        }
      }
    } catch (err) {
      console.error('[4C] send comment failed', err);
      showToast('Failed to send comment.', 'error');
    } finally {
      setIsSendingComment(false);
    }
  };

  const injectSavedReply = (reply: string) => {
    setCommentText(prev => prev ? prev + ' ' + reply : reply);
    showToast('Saved reply inserted.', 'info');
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      const filtered = mentionCandidates(users, currentUser.email).filter(u => (u.firstName + ' ' + u.lastName).toLowerCase().includes(mentionSearch));
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(prev => Math.min(prev + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Escape') { e.preventDefault(); setShowMentions(false); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[mentionIndex];
        if (target) {
          setCommentText(prev => applyMention(prev, `${target.firstName} ${target.lastName}`));
          setShowMentions(false);
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isSendingComment || !commentText.trim() || !activeTicket) return;
      if (!isAddressed(commentText.trim())) {
        setShowMentions(true);
        setMentionSearch('');
        setMentionIndex(0);
        showToast('Choose who to send this to.', 'info');
        return;
      }
      performSend(commentText.trim());
    }
  };

  const handleNewTicketSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  handleCreateTicket(newTicketForm);
  setShowNewTicketPanel(false);
  setNewTicketForm({ customerName: '', customerEmail: '', customerPhone: '', customerId: undefined, provider: '', category: '', priority: TicketPriority.HIGH, amount: '', transactionId: '', description: '' });
  setNewTicketErrors({});
};


  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4 overflow-hidden">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton variant="text" className="w-48" />
          <Skeleton variant="text" className="w-24" />
          <Skeleton variant="text" className="w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton variant="card" count={3} />
          </div>
          <div className="space-y-4">
            <Skeleton variant="card" count={4} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="flex-1 flex overflow-hidden">
        <TicketListPane
          activeTicketId={activeTicketId}
          showMobileTicketList={showMobileTicketList}
          setShowMobileTicketList={setShowMobileTicketList}
          onNewTicket={() => setShowNewTicketPanel(true)}
        />

        {activeTicket ? (
          <>
            <TicketDetailPane
              activeTicket={activeTicket}
              now={now}
              slaCountdown={slaCountdown}
              setShowMobileTicketList={setShowMobileTicketList}
              setShowMobileActivity={setShowMobileActivity}
              showDeclareResolution={showDeclareResolution}
              setShowDeclareResolution={setShowDeclareResolution}
              rcaForm={rcaForm}
              setRcaForm={setRcaForm}
              formErrors={formErrors}
              clearError={clearError}
              feedbackInput={feedbackInput}
              setFeedbackInput={setFeedbackInput}
              isRcaGenerating={isRcaGenerating}
              onBeginInvestigation={handleBeginInvestigation}
              onResolve={handleResolveTicket}
              onResolutionResponse={handleResolutionResponse}
              onAiGenerateRca={handleAiGenerateRca}
              onManualEscalate={handleManualEscalate}
              onMerge={handleMergeTicket}
              onDeclareMajorIncident={handleDeclareMajorIncidentWrapper}
              onArchive={handleSoftDeleteTicket}
              commentText={commentText}
              setCommentText={setCommentText}
              isSendingComment={isSendingComment}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              showMentions={showMentions}
              setShowMentions={setShowMentions}
              mentionSearch={mentionSearch}
              setMentionSearch={setMentionSearch}
              mentionIndex={mentionIndex}
              setMentionIndex={setMentionIndex}
              onSendComment={handleSendComment}
              onInjectSavedReply={injectSavedReply}
              onKeyDown={handleCommentKeyDown}
              onSendToEveryone={handleSendToEveryone}
            />

            <ActivityPanel
              activeTicket={activeTicket}
              now={now}
              activeTicketEvidence={evidence || []}
              selectedWatcherIds={selectedWatcherIds}
              setSelectedWatcherIds={setSelectedWatcherIds}
              newWatcherEmail={newWatcherEmail}
              setNewWatcherEmail={setNewWatcherEmail}
              setNotifyWatcherModal={setNotifyWatcherModal}
              setRemoveWatcherConfirm={setRemoveWatcherConfirm}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<Ticket className="w-12 h-12" />}
              title="No ticket selected"
              message="Select a ticket from the list to view its details."
            />
          </div>
        )}
      </div>

      <EscalationModals
        activeTicket={activeTicket}
        showEscalationModal={showEscalationModal}
        setShowEscalationModal={setShowEscalationModal}
        escalationReason={escalationReason}
        setEscalationReason={setEscalationReason}
        formErrors={formErrors}
        clearError={clearError}
        clearFormErrors={clearFormErrors}
        confirmEscalation={confirmEscalation}
        archiveConfirmId={archiveConfirmId}
        setArchiveConfirmId={setArchiveConfirmId}
        removeWatcherConfirm={removeWatcherConfirm}
        setRemoveWatcherConfirm={setRemoveWatcherConfirm}
        notifyWatcherModal={notifyWatcherModal}
        setNotifyWatcherModal={setNotifyWatcherModal}
        directMessageText={directMessageText}
        setDirectMessageText={setDirectMessageText}
        selectedWatcherIds={selectedWatcherIds}
        setSelectedWatcherIds={setSelectedWatcherIds}
      />

      <NewTicketModal
        isOpen={showNewTicketPanel}
        onClose={() => setShowNewTicketPanel(false)}
        form={newTicketForm}
        setForm={setNewTicketForm}
        errors={newTicketErrors}
        setErrors={setNewTicketErrors}
        onSubmit={handleNewTicketSubmit}
      />
    </PageTransition>
  );
}

export default React.memo(TicketWorkspacePage);
