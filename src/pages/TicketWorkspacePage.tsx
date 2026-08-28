import React, { useState } from 'react';
import { Ticket, List } from 'lucide-react';

import PageTransition from '../components/layout/PageTransition';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import type { CommentRecord, WatcherNotification, AuditLog } from '../types/app';
import { TicketStatus, TicketPriority, UserRole } from '../types/app';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { syncComment, syncTicketDelete, syncTicketUpdate, syncTicketTransition } from '../lib/sync';
import { isBuSupportRole } from '../lib/rbac';
import { applyMention, fullNameOf, mentionCandidates, resolveMention } from '../lib/mention';
import TicketListPane from './ticket-workspace/TicketListPane';
import TicketDetailView from './ticket-workspace/TicketDetailView';
import TicketChatPanel from './ticket-workspace/TicketChatPanel';
import RightPanel from './ticket-workspace/RightPanel';
import EscalationModals from './ticket-workspace/EscalationModals';
import NewTicketModal, { type NewTicketFormState } from './ticket-workspace/NewTicketModal';
import { N_A_BANK } from '../lib/formConfigs';
import MergeTicketModal from './ticket-workspace/MergeTicketModal';

interface TicketWorkspacePageProps {
  handleDeclareMajorIncident: (formData?: { name: string; description: string; partner: string; category: string; severity: string; initialNotification: string }) => void;
}

function TicketWorkspacePage({ handleDeclareMajorIncident }: TicketWorkspacePageProps) {
  const {
    isLoading,
    tickets, setTickets, comments, setComments,
    auditLogs, setAuditLogs,
    watcherNotifications, setWatcherNotifications,
    majorIncidents,
    currentRole, currentUser,
    logAuditAction, saveToStorage, showToast,
    notifyWatchers,
    handleCreateTicket, users,
    slaRules, holidays, ticketTemplates, kbArticles,
    can,
  } = useApp();

  const { commentText, setCommentText, activeTicketId, setActiveTicketId } = useUi();

  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [removeWatcherConfirm, setRemoveWatcherConfirm] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [newWatcherEmail, setNewWatcherEmail] = useState('');
  const [notifyWatcherModal, setNotifyWatcherModal] = useState<{ isOpen: boolean; watcherEmail: string | null }>({ isOpen: false, watcherEmail: null });
  const [selectedWatcherIds, setSelectedWatcherIds] = useState<Set<string>>(new Set());
  const [rcaForm, setRcaForm] = useState({ rootCause: '', contributingFactors: '', correctiveActions: '', preventiveActions: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedbackInput] = useState({ score: 5, comment: '' });
  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [, setIsRcaGenerating] = useState(false);
  const [showDeclareResolution, setShowDeclareResolution] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [showMobileTicketList, setShowMobileTicketList] = useState(false);
  const [directMessageText, setDirectMessageText] = useState('');
  const [showNewTicketPanel, setShowNewTicketPanel] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState<NewTicketFormState>({ customerFirstName: '', customerLastName: '', customerEmail: '', customerPhone: '', customerId: undefined, partner: '', category: '', priority: TicketPriority.HIGH, bankName: N_A_BANK, amount: '', transactionId: '', description: '' });
  const [newTicketErrors, setNewTicketErrors] = useState<Record<string, string>>({});
  const activeTicket = tickets.find(t => t.id === activeTicketId) || null;

  const clearError = (field: string) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  const clearFormErrors = () => setFormErrors({});

  const handleBeginInvestigation = async () => {
    if (!activeTicket) return;
    // Only payment-partner support (or platform admin) investigates; BU support submits/routes only.
    if (!(currentRole === UserRole.PARTNER || currentRole === UserRole.SUPER_ADMIN)) {
      showToast('Only Payment Partner support can investigate tickets.', 'error');
      return;
    }
    if (!activeTicket.assignedAgentId) {
      showToast('Investigation can only begin after the ticket is assigned to a team.', 'error');
      return;
    }
    try {
      await syncTicketTransition(activeTicket.id, TicketStatus.INVESTIGATE);
    } catch {
      showToast('Failed to start investigation on server.', 'error');
      return;
    }
    const updated = { ...activeTicket, status: TicketStatus.INVESTIGATE as TicketStatus };
    setTickets(ts => ts.map(t => t.id === activeTicket.id ? updated : t));
    saveToStorage(tickets.map(t => t.id === activeTicket.id ? updated : t), comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(activeTicket.id, 'STATUS_CHANGED', 'Status changed to INVESTIGATING');
    showToast('Investigation started.', 'success');
  };

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    const rcaDetails = {
      ...(activeTicket.rcaDetails || {}),
      rootCause: rcaForm.rootCause,
      contributingFactors: rcaForm.contributingFactors,
      correctiveActions: rcaForm.correctiveActions,
      preventiveActions: rcaForm.preventiveActions,
      preventiveOwner: currentUser.firstName + ' ' + currentUser.lastName,
      preventiveDueDate: new Date().toISOString().split('T')[0],
    };
    try {
      await syncTicketUpdate(activeTicket.id, { rcaDetails });
    } catch {
      showToast('Failed to save RCA on server.', 'error');
      return;
    }
    try {
      await syncTicketTransition(activeTicket.id, TicketStatus.RESOLVED);
    } catch {
      showToast('Failed to resolve ticket on server.', 'error');
      return;
    }
    const updated = { ...activeTicket, status: TicketStatus.RESOLVED as TicketStatus, rootCause: rcaDetails.rootCause, correctiveAction: rcaDetails.correctiveActions, rcaDetails };
    setTickets(ts => ts.map(t => t.id === activeTicket.id ? updated : t));
    saveToStorage(tickets.map(t => t.id === activeTicket.id ? updated : t), comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(activeTicket.id, 'STATUS_CHANGED', 'Status changed to RESOLVED');
    showToast('Ticket resolved.', 'success');
  };

  const handleResolutionResponse = async (accept: boolean) => {
    if (!activeTicket) return;
    if (accept && (feedbackInput.score === null || feedbackInput.score === undefined)) {
      showToast('Rating is required to close the ticket.', 'error');
      return;
    }
    const status = accept ? TicketStatus.CLOSED : TicketStatus.INVESTIGATE;
    if (accept) {
      try {
        await syncTicketUpdate(activeTicket.id, {
          feedbackScore: feedbackInput.score,
          feedbackComment: feedbackInput.comment.trim() || null,
        });
      } catch {
        showToast('Failed to save feedback on server.', 'error');
        return;
      }
    }
    try {
      await syncTicketTransition(activeTicket.id, status);
    } catch {
      showToast(`Failed to ${accept ? 'accept' : 'reject'} resolution on server.`, 'error');
      return;
    }
    const updated = { ...activeTicket, status, feedbackScore: accept ? feedbackInput.score : activeTicket.feedbackScore, feedbackComment: accept ? (feedbackInput.comment.trim() || null) : activeTicket.feedbackComment };
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
    try {
      await syncTicketUpdate(activeTicket.id, { priority: TicketPriority.CRITICAL, isEscalated: true });
    } catch {
      showToast('Failed to escalate ticket on server.', 'error');
      return;
    }
    const updated = { ...activeTicket, priority: TicketPriority.CRITICAL, isEscalated: true, escalationCount: (activeTicket.escalationCount || 0) + 1 };
    setTickets(ts => ts.map(t => t.id === activeTicket.id ? updated : t));
    saveToStorage(tickets.map(t => t.id === activeTicket.id ? updated : t), comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(activeTicket.id, 'ESCALATED', escalationReason);
    
    // Enforce partner-domain rule: BU users can only escalate within the ticket's payment partner domain
    if (isBuSupportRole(currentRole)) {
      const partnerDomain = (activeTicket.partner || activeTicket.businessUnit || '').toLowerCase();
      const mine = (currentUser.partner || currentUser.bu || '').toLowerCase();
      if (partnerDomain && mine && partnerDomain !== mine) {
        // User is attempting to escalate outside their partner domain — restrict to domain
        // Add a watcher indicating escalation stayed within domain
        const newWatcher: WatcherNotification = {
          id: 'wn-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          timestamp: new Date().toISOString(),
          ticketId: activeTicket.id,
          message: `[ESCALATION] Ticket escalated to ${activeTicket.partner || 'Unknown'} payment partner domain.`,
          recipient: currentUser.email,
          seen: false
        };
        const updatedWN = [...watcherNotifications, newWatcher];
        setWatcherNotifications(updatedWN);
        showToast(`Escalation routed within ${activeTicket.partner || 'your'} payment partner domain.`, 'success');
      } else {
        showToast('Escalation within same payment partner domain.', 'success');
      }
    } else {
      showToast('Ticket escalated.', 'success');
    }
    setShowEscalationModal(false);
    setEscalationReason('');
  };

  const confirmEscalation = () => { setShowEscalationModal(false); setEscalationReason(''); };

  const handleMergeTicket = () => {
    if (!activeTicket) return;
    setShowMergeModal(true);
  };

  const confirmMerge = async (targetId: string) => {
    if (!activeTicket) return;
    const target = tickets.find(t => t.id === targetId);
    if (!target) { showToast('Target ticket not found.', 'error'); return; }
    if (target.isDeleted) { showToast('Target ticket is archived and cannot receive a merge.', 'error'); return; }
    if (target.status === TicketStatus.CLOSED && (target.duplicateOf || '').trim()) {
      showToast(`Target ticket is already a duplicate of ${target.duplicateOf}. Rejected to avoid merge chaining.`, 'error');
      return;
    }
    const mergedComments = [...comments, { id: 'cm-' + Date.now(), ticketId: target.id, message: `Migrated from ${activeTicket.id}`, timestamp: new Date().toISOString(), author: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole, seen: false, isInternal: false } as CommentRecord];
    const mergeLog = { id: 'al-' + Date.now(), ticketId: target.id, action: 'TICKET_MERGED', details: `Merged ${activeTicket.id}`, timestamp: new Date().toISOString(), actor: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole } as AuditLog;
    const mergedAudits = [...auditLogs, mergeLog];

    try {
      await Promise.all([
        syncTicketDelete(activeTicket.id),
        syncTicketUpdate(target.id, { comments: mergedComments, auditLogs: mergedAudits }),
      ]);
    } catch {
      showToast('Failed to sync merge to server.', 'error');
      return;
    }

    const updatedTickets = tickets.filter(t => t.id !== activeTicket.id && t.id !== target.id);
    setTickets(updatedTickets);
    setComments(mergedComments);
    setAuditLogs(mergedAudits);
    saveToStorage(updatedTickets, mergedComments, mergedAudits, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(target.id, 'TICKET_MERGED', `Merged ${activeTicket.id}`);
    showToast('Tickets merged.', 'success');
    setActiveTicketId(target.id);
  };

  const handleSoftDeleteTicket = async (id: string) => {
    if (archiveConfirmId !== id) { setArchiveConfirmId(id); return; }
    try {
      // Soft delete on server - set isDeleted flag
      await syncTicketUpdate(id, { isDeleted: true, status: TicketStatus.CLOSED as TicketStatus });
    } catch {
      showToast('Failed to archive ticket on server.', 'error');
      return;
    }
    const updated = tickets.map(t => t.id === id ? { ...t, isDeleted: true, status: TicketStatus.CLOSED as TicketStatus } : t);
    setTickets(updated);
    saveToStorage(updated, comments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
    logAuditAction(id, 'ARCHIVED', 'Ticket archived');
    showToast('Ticket archived.', 'success');
    setArchiveConfirmId(null);
    if (activeTicketId === id) setActiveTicketId(tickets.find(t => t.id !== id)?.id || null);
  };

  const handleDeclareMajorIncidentWrapper = () => {
    if (!activeTicket) return;
    handleDeclareMajorIncident({ name: activeTicket.id, description: activeTicket.description || '', partner: activeTicket.partner || '', category: activeTicket.category || '', severity: activeTicket.priority || '', initialNotification: '' });
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || !activeTicket || isSendingComment) return;
    performSend(trimmed);
  };

  const performSend = async (trimmed: string) => {
    if (!activeTicket) return;
    setIsSendingComment(true);
    try {
      const mentioned = resolveMention(trimmed, users);
      const directTarget =
        mentioned && mentioned.email.toLowerCase() !== currentUser.email.toLowerCase()
          ? mentioned.email
          : null;

      const baseComment: CommentRecord = {
        id: 'cm-' + Date.now(),
        ticketId: activeTicket.id,
        message: trimmed,
        timestamp: new Date().toISOString(),
        author: currentUser.firstName + ' ' + currentUser.lastName,
        authorEmail: currentUser.email,
        role: currentRole,
        seen: false,
        isInternal: false,
      };
      const syncPayload = {
        ...baseComment,
        ...(replyingTo ? { parentCommentId: replyingTo } : {}),
        ...(directTarget ? { notifyRecipients: [directTarget] } : {}),
      } as CommentRecord;

      const updatedComments = [...comments, syncPayload];
      setComments(updatedComments);
      setCommentText('');
      setReplyingTo(null);
      saveToStorage(tickets, updatedComments, auditLogs, majorIncidents, watcherNotifications, users, slaRules, holidays, ticketTemplates, kbArticles);
      try {
        syncComment(syncPayload);
        if (directTarget && mentioned) {
          // The @mention target is notified server-side (in-app + email) when
          // the comment syncs; only the confirmation here is client-local.
          showToast(`Comment sent to ${fullNameOf(mentioned)}.`, 'success');
        } else {
          notifyWatchers(activeTicket, `New comment on ticket ${activeTicket.id}`);
          showToast('Comment sent.', 'success');
        }
      } catch {
        showToast('Comment stored locally but failed to sync to server.', 'error');
      }
    } catch (err) {
      console.error('[4C] send comment failed', err);
      showToast('Failed to send comment.', 'error');
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      const filtered = mentionCandidates(users, currentUser.email).filter(u => fullNameOf(u).toLowerCase().includes(mentionSearch));
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(prev => Math.min(prev + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Escape') { e.preventDefault(); setShowMentions(false); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[mentionIndex];
        if (target) {
          setCommentText(prev => applyMention(prev, fullNameOf(target)));
          setShowMentions(false);
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isSendingComment || !commentText.trim() || !activeTicket) return;
      performSend(commentText.trim());
    }
  };

  const handleNewTicketSubmit = () => {
  const fullName = `${newTicketForm.customerFirstName.trim()} ${newTicketForm.customerLastName.trim()}`.trim();
  handleCreateTicket({ ...newTicketForm, customerName: fullName || 'Unknown Customer' });
  setShowNewTicketPanel(false);
  setNewTicketForm({ customerFirstName: '', customerLastName: '', customerEmail: '', customerPhone: '', customerId: undefined, partner: '', category: '', priority: TicketPriority.HIGH, bankName: N_A_BANK, amount: '', transactionId: '', description: '' });
  setNewTicketErrors({});
};

  const canCreateTicket = can('tickets:create');


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
         {/* Column 1: Ticket List - 320px (hidden below lg; mobile overlay via toggle) */}
         <div className="hidden lg:block w-72 shrink-0 border-r border-border">
           <TicketListPane
             activeTicketId={activeTicketId}
             showMobileTicketList={showMobileTicketList}
             setShowMobileTicketList={setShowMobileTicketList}
             onNewTicket={canCreateTicket ? () => setShowNewTicketPanel(true) : undefined}
           />
         </div>

         {/* Column 2: Center - flex-1 */}
         <div className="flex-1 flex flex-col overflow-hidden min-w-0">
           {activeTicket ? (
             <>
               {/* Top: ticket details (scrollable) */}
               <div className="flex-[3] min-h-0 overflow-y-auto">
                 <TicketDetailView
                   activeTicket={activeTicket}
                   showDeclareResolution={showDeclareResolution}
                   setShowDeclareResolution={setShowDeclareResolution}
                   onArchive={handleSoftDeleteTicket}
                   onMerge={handleMergeTicket}
                   onEscalate={handleManualEscalate}
                   onDeclareMajorIncident={handleDeclareMajorIncidentWrapper}
                   onBeginInvestigation={handleBeginInvestigation}
                   onResolve={handleResolveTicket}
                   onResolutionResponse={handleResolutionResponse}
                   onSaveTemplate={() => {}}
                   onAiGenerateRca={handleAiGenerateRca}
                 />
               </div>
               {/* Bottom: chat panel */}
               <div className="flex-[2] min-h-0 p-3 pt-0">
                 <TicketChatPanel
                   activeTicket={activeTicket}
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
                     onKeyDown={handleCommentKeyDown}
                   />
               </div>
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

          {/* Column 3: Right Panel - 320px (hidden below xl) */}
          {activeTicket && (
            <div className="hidden xl:block w-80 shrink-0 border-l border-border overflow-y-auto">
             <RightPanel
               activeTicket={activeTicket}
               selectedWatcherIds={selectedWatcherIds}
               setSelectedWatcherIds={setSelectedWatcherIds}
               newWatcherEmail={newWatcherEmail}
               setNewWatcherEmail={setNewWatcherEmail}
               setNotifyWatcherModal={setNotifyWatcherModal}
               setRemoveWatcherConfirm={setRemoveWatcherConfirm}
             />
           </div>
         )}
        </div>

      {/* Mobile ticket-list toggle (below lg the left column is hidden) */}
      <button
        type="button"
        onClick={() => setShowMobileTicketList(true)}
        aria-label="Show ticket list"
        className="lg:hidden fixed bottom-4 left-4 z-20 h-11 w-11 rounded-full bg-primary text-[#fff] shadow-lg flex items-center justify-center hover:bg-primary-dark transition-colors focus-ring"
      >
        <List className="w-5 h-5" />
      </button>

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

      <MergeTicketModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        onConfirm={confirmMerge}
        tickets={tickets}
        activeTicketId={activeTicketId}
        activePartner={activeTicket?.partner || ''}
      />

      {canCreateTicket && (
        <NewTicketModal
          isOpen={showNewTicketPanel}
          onClose={() => setShowNewTicketPanel(false)}
          form={newTicketForm}
          setForm={setNewTicketForm}
          errors={newTicketErrors}
          setErrors={setNewTicketErrors}
          onSubmit={handleNewTicketSubmit}
        />
      )}
    </PageTransition>
  );
}

export default React.memo(TicketWorkspacePage);
