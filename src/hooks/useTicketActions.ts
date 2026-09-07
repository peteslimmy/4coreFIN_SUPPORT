import { useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { TicketStatus, TicketPriority, UserRole } from '../types/app';
import type { CommentRecord, AuditLog } from '../types/app';
import type { TicketRecord } from '../types/app';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { useTicketUI } from '../context/TicketUIContext';
import { syncComment, syncTicketDelete, syncTicketUpdate, syncTicketTransition } from '../lib/sync';
import { ApiError } from '../lib/api';
import { isBuSupportRole } from '../lib/rbac';
import { applyMention, fullNameOf, mentionCandidates, resolveMention } from '../lib/mention';

interface UseTicketActionsParams {
  activeTicket: TicketRecord | null;
}

export function useTicketActions({ activeTicket }: UseTicketActionsParams) {
  const {
    tickets,
    comments,
    auditLogs,
    currentRole,
    currentUser,
    logAuditAction,
    showToast,
    users,
    setActiveTicketId,
  } = useApp();

  const { state: uiState, actions: uiActions } = useTicketUI();
  const { commentText } = useUi();

  const handleBeginInvestigation = useCallback(async () => {
    if (!activeTicket) return;
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
    showToast('Investigation started.', 'success');
    logAuditAction(activeTicket.id, 'STATUS_CHANGED', 'Status changed to INVESTIGATING');
  }, [activeTicket, currentRole, showToast, logAuditAction]);

  const handleResolveTicket = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    const rcaDetails = {
      ...(activeTicket.rcaDetails || {}),
      rootCause: uiState.rcaForm.rootCause,
      contributingFactors: uiState.rcaForm.contributingFactors,
      correctiveActions: uiState.rcaForm.correctiveActions,
      preventiveActions: uiState.rcaForm.preventiveActions,
      preventiveOwner: `${currentUser.firstName} ${currentUser.lastName}`,
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
    showToast('Ticket resolved.', 'success');
    logAuditAction(activeTicket.id, 'STATUS_CHANGED', 'Status changed to RESOLVED');
    uiActions.resetRcaForm();
    uiActions.setDeclareResolution(false);
  }, [activeTicket, currentUser, uiState.rcaForm, showToast, logAuditAction, uiActions]);

  const handleResolutionResponse = useCallback(async (accept: boolean) => {
    if (!activeTicket) return;
    if (accept && (uiState.feedbackInput.score === null || uiState.feedbackInput.score === undefined)) {
      showToast('Rating is required to close the ticket.', 'error');
      return;
    }
    const status = accept ? TicketStatus.CLOSED : TicketStatus.INVESTIGATE;
    if (accept) {
      try {
        await syncTicketUpdate(activeTicket.id, {
          feedbackScore: uiState.feedbackInput.score,
          feedbackComment: uiState.feedbackInput.comment.trim() || null,
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
    logAuditAction(activeTicket.id, 'RESOLUTION_' + (accept ? 'ACCEPTED' : 'REJECTED'), '');
    showToast(accept ? 'Resolution accepted.' : 'Resolution rejected.', accept ? 'success' : 'info');
    uiActions.updateFeedback({ score: 5, comment: '' });
  }, [activeTicket, uiState.feedbackInput, showToast, logAuditAction, uiActions]);

  const handleAiGenerateRca = useCallback(async () => {
    if (!activeTicket) return;
    uiActions.setRcaGenerating(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      uiActions.updateRcaForm({ rootCause: 'System overload during peak hours.', contributingFactors: 'Database connection pool exhaustion.', correctiveActions: 'Added connection pool monitoring and auto-scaling.', preventiveActions: 'Review capacity quarterly and add circuit breakers.' });
      showToast('RCA generated successfully.', 'success');
    } finally {
      uiActions.setRcaGenerating(false);
    }
  }, [activeTicket, uiActions, showToast]);

  const handleManualEscalate = useCallback(async () => {
    if (!activeTicket) return;
    const reason = uiState.escalationReason.trim();
    try {
      // The reason travels in-band: the server validates it, applies the
      // tickets:escalate permission and writes the compliance audit entry.
      await syncTicketUpdate(activeTicket.id, {
        priority: TicketPriority.CRITICAL,
        isEscalated: true,
        escalationReason: reason,
      });
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to escalate ticket on server.', 'error');
      return;
    }
    if (isBuSupportRole(currentRole)) {
      const partnerDomain = (activeTicket.partner || activeTicket.businessUnit || '').toLowerCase();
      const mine = (currentUser.partner || currentUser.bu || '').toLowerCase();
      if (partnerDomain && mine && partnerDomain !== mine) {
        showToast(`Escalation routed within ${activeTicket.partner || 'your'} payment partner domain.`, 'success');
      } else {
        showToast('Escalation within same payment partner domain.', 'success');
      }
    } else {
      showToast('Ticket escalated.', 'success');
    }
    uiActions.setEscalationModal(false);
    uiActions.setEscalationReason('');
  }, [activeTicket, uiState.escalationReason, currentRole, currentUser, showToast, uiActions]);

  const handleMergeTicket = useCallback(() => {
    if (!activeTicket) return;
    uiActions.setMergeModal(true);
  }, [activeTicket, uiActions]);

  const confirmMerge = useCallback(async (targetId: string) => {
    if (!activeTicket) return;
    const target = tickets.find(t => t.id === targetId);
    if (!target) { showToast('Target ticket not found.', 'error'); return; }
    if (target.isDeleted) { showToast('Target ticket is archived and cannot receive a merge.', 'error'); return; }
    if (target.status === TicketStatus.CLOSED && (target.duplicateOf || '').trim()) {
      showToast(`Target ticket is already a duplicate of ${target.duplicateOf}. Rejected to avoid merge chaining.`, 'error');
      return;
    }
    const mergedComments = [...comments, { id: 'cm-' + Date.now(), ticketId: target.id, message: `Migrated from ${activeTicket.id}`, timestamp: new Date().toISOString(), author: `${currentUser.firstName} ${currentUser.lastName}`, role: currentRole, seen: false, isInternal: false } as CommentRecord];
    const mergeLog = { id: 'al-' + Date.now(), ticketId: target.id, action: 'TICKET_MERGED', details: `Merged ${activeTicket.id}`, timestamp: new Date().toISOString(), actor: `${currentUser.firstName} ${currentUser.lastName}`, role: currentRole } as AuditLog;
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

    logAuditAction(target.id, 'TICKET_MERGED', `Merged ${activeTicket.id}`);
    showToast('Tickets merged.', 'success');
    setActiveTicketId(target.id);
    uiActions.setMergeModal(false);
  }, [activeTicket, tickets, comments, auditLogs, currentUser, currentRole, showToast, logAuditAction, setActiveTicketId, uiActions]);

  const handleSoftDeleteTicket = useCallback(async (id: string) => {
    if (uiState.archiveConfirmId !== id) { uiActions.setArchiveConfirm(id); return; }
    try {
      await syncTicketUpdate(id, { isDeleted: true, status: TicketStatus.CLOSED as TicketStatus });
    } catch {
      showToast('Failed to archive ticket on server.', 'error');
      return;
    }
    logAuditAction(id, 'ARCHIVED', 'Ticket archived');
    showToast('Ticket archived.', 'success');
    uiActions.setArchiveConfirm(null);
    if (activeTicket?.id === id) {
      const next = tickets.find(t => t.id !== id && !t.isDeleted);
      setActiveTicketId(next?.id || null);
    }
  }, [activeTicket, tickets, uiState.archiveConfirmId, showToast, logAuditAction, setActiveTicketId, uiActions]);

  const handleWatchToggle = useCallback(() => {
    if (!activeTicket) return;
    const isWatching = (activeTicket.watchers || []).includes(currentUser.email);
    showToast(isWatching ? 'Unwatched.' : 'Now watching.', 'success');
    logAuditAction(activeTicket.id, isWatching ? 'TICKET_UNWATCHED_SELF' : 'TICKET_WATCHED_SELF', `${currentUser.firstName} ${currentUser.lastName} ${isWatching ? 'UNWATCHED' : 'WATCHING'}`);
  }, [activeTicket, currentUser, showToast, logAuditAction]);

  const performSend = useCallback(async (trimmed: string) => {
    if (!activeTicket) return;
    uiActions.setSendingComment(true);
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
        author: `${currentUser.firstName} ${currentUser.lastName}`,
        authorEmail: currentUser.email,
        role: currentRole,
        seen: false,
        isInternal: false,
      };
      const syncPayload = {
        ...baseComment,
        ...(uiState.replyingTo ? { parentCommentId: uiState.replyingTo } : {}),
        ...(directTarget ? { notifyRecipients: [directTarget] } : {}),
      } as CommentRecord;

      uiActions.setCommentText('');
      uiActions.setReplyingTo(null);
      try {
        syncComment(syncPayload);
        if (directTarget && mentioned) {
          showToast(`Comment sent to ${fullNameOf(mentioned)}.`, 'success');
        } else {
          showToast('Comment sent.', 'success');
        }
      } catch {
        showToast('Comment stored locally but failed to sync to server.', 'error');
      }
    } catch (err) {
      console.error('[4C] send comment failed', err);
      showToast('Failed to send comment.', 'error');
    } finally {
      uiActions.setSendingComment(false);
    }
  }, [activeTicket, users, currentUser, currentRole, uiState.replyingTo, uiActions, showToast]);

  const handleSendComment = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || !activeTicket || uiState.isSendingComment) return;
    performSend(trimmed);
  }, [commentText, activeTicket, uiState.isSendingComment, performSend]);

  const handleCommentKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (uiState.showMentions) {
      const filtered = mentionCandidates(users, currentUser.email).filter(u => fullNameOf(u).toLowerCase().includes(uiState.mentionSearch));
      if (e.key === 'ArrowDown') { e.preventDefault(); uiActions.setMentionIndex(prev => Math.min(prev + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); uiActions.setMentionIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Escape') { e.preventDefault(); uiActions.setShowMentions(false); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[uiState.mentionIndex];
        if (target) {
          uiActions.updateNewTicketForm({ commentText: applyMention(uiState.commentText, fullNameOf(target)) });
          uiActions.setShowMentions(false);
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (uiState.isSendingComment || !commentText.trim() || !activeTicket) return;
      performSend(commentText.trim());
    }
  }, [uiState, commentText, activeTicket, users, currentUser, performSend, uiActions]);

  const handleDeclareMajorIncidentWrapper = useCallback(() => {
    if (!activeTicket) return;
    // This is handled via props in the main component
  }, [activeTicket]);

  return {
    handleBeginInvestigation,
    handleResolveTicket,
    handleResolutionResponse,
    handleAiGenerateRca,
    handleManualEscalate,
    handleMergeTicket,
    confirmMerge,
    handleSoftDeleteTicket,
    handleWatchToggle,
    handleSendComment,
    handleCommentKeyDown,
    handleDeclareMajorIncidentWrapper,
  };
}
