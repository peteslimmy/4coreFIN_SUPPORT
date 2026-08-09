import React from 'react';
import {
  AlertTriangle, Bell, Combine, Copy, CheckCircle, FileText, Sliders, Sparkles, Info, Activity, UserCheck
} from 'lucide-react';

import ProgressWizard from '../../components/ui/ProgressWizard';
import TicketActivitySection from './TicketActivitySection';
import type { TicketRecord } from '../../types/app';
import { TicketStatus, UserRole } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { formatCurrency, formatSlaDuration, getTicketStatusStep, TICKET_STATUS_ORDER, TICKET_STATUS_LABELS } from '../../lib/utils';
import { syncTicketPatch, syncKbArticles } from '../../lib/sync';

interface TicketDetailPaneProps {
  activeTicket: TicketRecord;
  now: number;
  slaCountdown: string;
  setShowMobileTicketList: (v: boolean) => void;
  setShowMobileActivity: (v: boolean) => void;
  showDeclareResolution: boolean;
  setShowDeclareResolution: (v: boolean) => void;
  rcaForm: { rootCause: string; contributingFactors: string; correctiveActions: string; preventiveActions: string };
  setRcaForm: React.Dispatch<React.SetStateAction<{ rootCause: string; contributingFactors: string; correctiveActions: string; preventiveActions: string }>>;
  formErrors: Record<string, string>;
  clearError: (field: string) => void;
  feedbackInput: { score: number; comment: string };
  setFeedbackInput: React.Dispatch<React.SetStateAction<{ score: number; comment: string }>>;
  isRcaGenerating: boolean;
  onBeginInvestigation: () => void;
  onResolve: (e: React.FormEvent) => void;
  onResolutionResponse: (accept: boolean) => void;
  onAiGenerateRca: () => void;
  onManualEscalate: () => void;
  onMerge: () => void;
  onDeclareMajorIncident: () => void;
  onArchive: (id: string) => void;
  commentText: string;
  setCommentText: React.Dispatch<React.SetStateAction<string>>;
  isSendingComment: boolean;
  replyingTo: string | null;
  setReplyingTo: (v: string | null) => void;
  showMentions: boolean;
  setShowMentions: (v: boolean) => void;
  mentionSearch: string;
  setMentionSearch: (v: string) => void;
  mentionIndex: number;
  setMentionIndex: (v: number | ((p: number) => number)) => void;
  onSendComment: (e: React.FormEvent) => void;
  onInjectSavedReply: (reply: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendToEveryone: () => void;
}

export default function TicketDetailPane(props: TicketDetailPaneProps) {
  const {
    activeTicket, now, slaCountdown,
    setShowMobileTicketList,
    setShowMobileActivity,
    showDeclareResolution, setShowDeclareResolution,
    rcaForm, setRcaForm, formErrors, clearError,
    feedbackInput, setFeedbackInput,
    isRcaGenerating,
    onBeginInvestigation, onResolve, onResolutionResponse, onAiGenerateRca,
    onManualEscalate, onMerge, onDeclareMajorIncident, onArchive,
    commentText, setCommentText, isSendingComment, replyingTo, setReplyingTo,
    showMentions, setShowMentions, mentionSearch, setMentionSearch, mentionIndex, setMentionIndex,
    onSendComment, onInjectSavedReply, onKeyDown, onSendToEveryone,
  } = props;

  const {
    currentRole, currentUser, tickets, setTickets, comments, auditLogs,
    kbArticles, setKbArticles, buFormConfigs, saveToStorage, showToast, logAuditAction,
  } = useApp();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return { bg: 'var(--color-priority-critical-bg)', text: 'var(--color-priority-critical-text)', border: 'var(--color-priority-critical-border)', Icon: AlertTriangle };
      case 'HIGH': return { bg: 'var(--color-priority-high-bg)', text: 'var(--color-priority-high-text)', border: 'var(--color-priority-high-border)', Icon: AlertTriangle };
      case 'MEDIUM': return { bg: 'var(--color-priority-medium-bg)', text: 'var(--color-priority-medium-text)', border: 'var(--color-priority-medium-border)', Icon: Info };
      case 'LOW': return { bg: 'var(--color-priority-low-bg)', text: 'var(--color-priority-low-text)', border: 'var(--color-priority-low-border)', Icon: Info };
      default: return { bg: 'var(--color-priority-low-bg)', text: 'var(--color-priority-low-text)', border: 'var(--color-priority-low-border)', Icon: Info };
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <header className="bg-surface-elevated border-b border-border shrink-0">
        <div className="px-4 lg:px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button onClick={() => setShowMobileTicketList(true)} className="lg:hidden p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors focus-ring" aria-label="Show ticket list">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="min-w-0">
              <p className="text-overline">Ticket ID</p>
              <h2 className="font-numeric font-bold text-[10px] text-text-primary tracking-tight max-w-full">{activeTicket.id}</h2>
            </div>
            {(() => {
              const pColor = getPriorityColor(activeTicket.priority);
              const PriorityIcon = pColor.Icon;
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border shrink-0" style={{ backgroundColor: pColor.bg, color: pColor.text, borderColor: pColor.border }}>
                  <PriorityIcon className="w-3 h-3" /> {activeTicket.priority}
                </span>
              );
            })()}
            {activeTicket.isEscalated && (
              <span className="px-2 py-0.5 bg-error text-white rounded-full text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 shrink-0">
                <AlertTriangle className="w-3 h-3" /> Escalated
              </span>
            )}
            {activeTicket.duplicateOf && (
              <span className="px-2 py-0.5 bg-accent/15 text-accent-light rounded-full text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 shrink-0" title={`Duplicate of ${activeTicket.duplicateOf}`}>
                <Copy className="w-3 h-3" /> Duplicate of {activeTicket.duplicateOf}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-text-muted min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <span className="truncate">
                Owner: <strong className="font-semibold text-text-primary">{activeTicket.provider}</strong>
                {activeTicket.assignedAgentId && <span className="text-text-muted"> · {activeTicket.assignedAgentId}</span>}
              </span>
            </span>
          </div>
            <div className="flex items-center justify-end gap-2 flex-wrap mt-3">
              <button onClick={() => setShowMobileActivity(true)} className="lg:hidden px-2 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring flex items-center gap-1"><span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg></span> Activity</button>
              <button id="toggle-watch-btn" onClick={() => {
                const isWatching = (activeTicket.watchers || []).includes(currentUser.email);
                const updated = tickets.map(t => {
                  if (t.id === activeTicket.id) {
                    const currentWatchers = t.watchers || [];
                    const newWatchers = isWatching ? currentWatchers.filter(email => email.toLowerCase() !== currentUser.email.toLowerCase()) : [...currentWatchers, currentUser.email];
                    return { ...t, watchers: newWatchers };
                  }
                  return t;
                });
                setTickets(updated); saveToStorage(updated, comments, auditLogs);
                const changedTicket = updated.find(t => t.id === activeTicket.id);
                if (changedTicket) syncTicketPatch(changedTicket.id, { watchers: changedTicket.watchers || [] });
                showToast(isWatching ? 'Unwatched.' : 'Now watching.', 'success');
                logAuditAction(activeTicket.id, isWatching ? 'TICKET_UNWATCHED_SELF' : 'TICKET_WATCHED_SELF', `${currentUser.firstName + ' ' + currentUser.lastName} ${isWatching ? 'UNWATCHED' : 'WATCHING'}`);
              }} className={`px-2 py-1 rounded-md text-xs font-medium transition focus-ring flex items-center gap-1 cursor-pointer ${(activeTicket.watchers || []).includes(currentUser.email) ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}`}>
                <Bell className={`w-3 h-3 ${(activeTicket.watchers || []).includes(currentUser.email) ? 'fill-accent text-accent' : ''}`} />
                <span className="hidden sm:inline">{(activeTicket.watchers || []).includes(currentUser.email) ? 'Watching' : 'Watch'}</span>
              </button>
              {currentRole === UserRole.BU_SUPPORT && (
                <>
                  <button onClick={onManualEscalate} className="px-2 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Escalate</button>
                  <button onClick={onMerge} className="px-2 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring hidden sm:flex items-center gap-1"><Combine className="w-3 h-3" /> Merge</button>
                  <button onClick={onDeclareMajorIncident} className="px-2 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Major</button>
                  <button onClick={() => onArchive(activeTicket.id)} className="px-2 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring">Archive</button>
                </>
              )}
              {(currentRole === UserRole.SUPER_ADMIN || currentRole === UserRole.EXECUTIVE) && (
                <button onClick={() => onArchive(activeTicket.id)} className="px-2 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring">Archive</button>
              )}
              <div className="h-8 w-px bg-border shrink-0 hidden sm:block" />
              <div className="text-right shrink-0">
                <p className="text-overline">SLA</p>
                <p className={`text-xs font-mono font-bold ${activeTicket.isEscalated ? 'text-error' : 'text-text-primary'}`}>{slaCountdown}</p>
              </div>
            </div>
        </div>
      </header>

      <div className="bg-surface-elevated border-b border-border py-3 px-6 lg:px-8 shrink-0">
        <div className="max-w-2xl mx-auto">
          <ProgressWizard steps={TICKET_STATUS_ORDER.map(s => ({ label: TICKET_STATUS_LABELS[s] }))} currentStep={getTicketStatusStep(activeTicket.status)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="bg-surface-card rounded-xl shadow-card overflow-hidden">
          {(() => {
            const slaBreached = new Date(activeTicket.slaDeadline).getTime() < now;
            if (!slaBreached) return null;
            return (
              <div className="bg-error/5 border-b border-error/15 px-5 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                  <span className="text-xs font-bold text-error uppercase tracking-wider">{activeTicket.provider} Provider Team / SLA Breached -{formatSlaDuration(new Date(activeTicket.slaDeadline).getTime(), now)}</span>
                </div>
              </div>
            );
          })()}

          <div className="p-5">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-5 h-5 rounded bg-primary-light flex items-center justify-center text-primary"><Info className="w-3 h-3" /></span>
              <h3 className="text-xs font-heading font-bold text-text-muted uppercase tracking-wide">Ticket Info</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
              <div>
                <p className="text-caption text-text-muted font-medium mb-1">Customer Name</p>
                <p className="text-body-sm font-semibold text-text-primary">{activeTicket.customerName}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted font-medium mb-1">Transaction ID</p>
                <p className="text-body-sm font-mono font-bold text-accent">{activeTicket.transactionId}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted font-medium mb-1">Issue Category</p>
                <p className="text-body-sm font-semibold text-text-primary">{activeTicket.category}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted font-medium mb-1">Amount</p>
                <p className="text-h3 font-heading font-bold text-text-primary">{activeTicket.amount ? formatCurrency(activeTicket.amount) : 'Undefined'}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted font-medium mb-1">Opened</p>
                <p className="text-body-sm font-semibold text-text-primary">{new Date(activeTicket.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted font-medium mb-1">Provider</p>
                <p className="text-body-sm font-semibold text-text-primary">{activeTicket.provider}</p>
              </div>
            </div>
            {activeTicket.customFields && Object.keys(activeTicket.customFields).length > 0 && (
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
                {Object.entries(activeTicket.customFields).map(([key, val]) => {
                  const label = buFormConfigs
                    .flatMap(c => c.fields)
                    .find(f => f.id === key)?.label || key;
                  return (
                    <div key={key}>
                      <p className="text-caption text-text-muted font-medium mb-1">{label}</p>
                      <p className="text-body-sm font-semibold text-text-primary capitalize">{String(val)}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-caption text-text-muted font-medium mb-1.5">Description</p>                <p className="text-body-sm text-text-secondary leading-relaxed bg-surface p-4 rounded-lg border-l-[3px] border-accent/30">{activeTicket.description}</p>
            </div>
          </div>
        </div>

        <TicketActivitySection
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
          onSendComment={onSendComment}
          onInjectSavedReply={onInjectSavedReply}
          onManualEscalate={onManualEscalate}
          onKeyDown={onKeyDown}
          onSendToEveryone={onSendToEveryone}
        />

        {activeTicket.status !== TicketStatus.RESOLVED && activeTicket.status !== TicketStatus.CLOSED && currentRole === UserRole.PROVIDER && (
          <div className="space-y-6">
            {activeTicket.status === TicketStatus.RECEIPT ? (
              <div className="bg-surface-elevated rounded-xl p-6">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-text-muted" />
                  <h4 className="text-body-sm font-semibold text-text-primary">Awaiting Assignment</h4>
                </div>
                <p className="text-xs text-text-muted mt-1 max-w-xl">This ticket is in Receipt and has not been assigned yet. Investigation can begin once it is assigned.</p>
              </div>
            ) : activeTicket.status !== TicketStatus.INVESTIGATE ? (
              <div className="bg-warning-light rounded-xl p-6 dark:bg-warning-light">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h4 className="text-body-sm font-semibold flex items-center gap-2 text-text-primary"><Activity className="w-5 h-5 text-warning" /> Begin Investigation</h4>
                    <p className="text-xs text-text-muted mt-1 max-w-xl">Initiate investigation protocol per standard procedures.</p>
                  </div>
                  <button onClick={onBeginInvestigation} className="px-5 py-2.5 bg-warning hover:bg-warning-dark text-white font-semibold rounded-lg text-xs transition focus-ring flex items-center gap-1.5 shrink-0"><Sparkles className="w-4 h-4" /> Start Investigation</button>
                </div>
              </div>
            ) : (
              <div className="bg-success-light rounded-xl p-6 space-y-4 dark:bg-success-light">
                <div className="flex justify-between items-center border-b border-success pb-3 flex-wrap gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-success-dark mb-1">Active Investigation</h4>
                    <p className="text-body-sm font-bold text-text-primary">Investigation in progress</p>
                  </div>
                  <span className="text-[10px] bg-success text-success-dark font-mono font-semibold px-3 py-1 rounded border border-success dark:bg-success dark:text-success-dark">RUNNING</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">Investigation is underway. Mark as resolved when findings are complete to proceed to the resolution declaration.</p>
                <div className="flex justify-end">
                  <button onClick={() => { setShowDeclareResolution(true); logAuditAction(activeTicket.id, 'PROVIDER_MARKED_RESOLVED', 'Provider marked investigation as resolved, proceeding to resolution declaration.'); }} className="px-5 py-2.5 bg-success hover:bg-success-dark text-white font-semibold rounded-lg text-xs transition focus-ring flex items-center gap-1.5 shrink-0 cursor-pointer"><CheckCircle className="w-4 h-4" /> Resolved</button>
                </div>
              </div>
            )}

            {activeTicket.status === TicketStatus.INVESTIGATE && showDeclareResolution && (
              <div className="bg-surface-elevated rounded-xl p-6">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                  <h4 className="text-body-sm font-semibold flex items-center gap-2 text-text-primary"><Sliders className="w-5 h-5 text-primary" /> Declare Resolution (RCA Required)</h4>
                  <div className="flex items-center gap-2">
                    {kbArticles.filter(a => a.tags.includes('rca-template') || a.category === 'Resolution').length > 0 && (
                      <select onChange={(e) => {
                        const art = kbArticles.find(a => a.id === e.target.value); if (!art) return;
                        const lines = art.content.split('\n').filter(Boolean);
                        setRcaForm({ rootCause: lines[0] || '', contributingFactors: lines[1] || '', correctiveActions: lines[2] || '', preventiveActions: lines[3] || '' });
                        showToast(`Loaded: ${art.title}`, 'success');
                      }} defaultValue="" className="bg-surface border border-border text-text-primary text-xs rounded-lg px-3 py-1.5 outline-none transition-all duration-200 focus-ring cursor-pointer focus:ring-2 focus:ring-accent/20">
                        <option value="" disabled>Load Template</option>
                        {kbArticles.filter(a => a.tags.includes('rca-template') || a.category === 'Resolution').map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                      </select>
                    )}
                    <button type="button" id="ai-draft-rca-btn" onClick={onAiGenerateRca} disabled={isRcaGenerating} className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition focus-ring cursor-pointer disabled:opacity-50"><Sparkles className="w-3.5 h-3.5" /> {isRcaGenerating ? 'Drafting...' : 'AI Draft'}</button>
                  </div>
                </div>
                <p className="text-xs text-text-muted mb-4">Complete the 4-field Root Cause Analysis. Owner and Due Date are captured automatically at declaration. All fields permanently logged.</p>
                <form onSubmit={onResolve} className="space-y-4">
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Root Cause</label>
                      <textarea rows={2} placeholder="Exact technical root cause..." value={rcaForm.rootCause} onChange={(e) => { setRcaForm(prev => ({ ...prev, rootCause: e.target.value })); clearError('rootCause'); }} className={`w-full bg-surface-elevated border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary ${formErrors.rootCause ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.rootCause} required />
                      {formErrors.rootCause && <p className="text-xs text-error mt-1" role="alert">{formErrors.rootCause}</p>}
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Contributing Factors</label>
                      <textarea rows={2} placeholder="Contributing factors..." value={rcaForm.contributingFactors} onChange={(e) => setRcaForm(prev => ({ ...prev, contributingFactors: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Corrective Actions</label>
                      <input type="text" placeholder="Immediate steps taken..." value={rcaForm.correctiveActions} onChange={(e) => { setRcaForm(prev => ({ ...prev, correctiveActions: e.target.value })); clearError('correctiveActions'); }} className={`w-full bg-surface-elevated border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary ${formErrors.correctiveActions ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.correctiveActions} required />
                      {formErrors.correctiveActions && <p className="text-xs text-error mt-1" role="alert">{formErrors.correctiveActions}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Preventive Actions</label>
                      <input type="text" placeholder="Long-term prevention..." value={rcaForm.preventiveActions} onChange={(e) => setRcaForm(prev => ({ ...prev, preventiveActions: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs focus:ring-2 focus:ring-accent/20 focus:border-border outline-none transition-all duration-200 focus-ring text-text-primary" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Owner</label>
                      <input type="text" value={currentUser.firstName + ' ' + currentUser.lastName} readOnly className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-text-muted cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Declared At</label>
                      <input type="text" value={new Date().toLocaleString()} readOnly className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-text-muted cursor-not-allowed" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-semibold transition focus-ring flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Submit</button>
                    <button type="button" onClick={() => {
                      const content = [rcaForm.rootCause, rcaForm.contributingFactors, rcaForm.correctiveActions, rcaForm.preventiveActions].join('\n');
                      if (!content.trim()) { showToast('Fill in RCA first.', 'error'); return; }
                      const newKb = { id: 'kb-' + Date.now(), title: `RCA: ${activeTicket.category}`, category: 'Resolution' as const, provider: activeTicket.provider, content, tags: ['rca-template', activeTicket.category, activeTicket.provider], lastUpdated: new Date().toISOString().split('T')[0] };
                      setKbArticles(prev => [...prev, newKb]);
                      syncKbArticles([...kbArticles, newKb]);
                      showToast('Saved as template.', 'success');
                    }} className="px-3 py-2 bg-surface hover:bg-surface-card text-text-primary rounded-lg text-xs font-semibold transition focus-ring">Save Template</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {activeTicket.status === TicketStatus.RESOLVED && currentRole === UserRole.BU_SUPPORT && (
          <div className="bg-accent/5 border border-accent/10 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-accent rounded-lg text-white shrink-0"><UserCheck className="w-5 h-5" /></div>
              <div className="flex-1">
                <h4 className="text-body-sm font-bold text-text-primary">Resolution Validation Required</h4>
                <p className="text-xs text-text-muted mt-1 mb-4 leading-relaxed">Provider declared this resolved. Root Cause: <strong>{activeTicket.rootCause}</strong>. Validate and provide feedback.</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-semibold text-text-primary">Rating:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} onClick={() => setFeedbackInput(prev => ({ ...prev, score: star }))} className={`w-8 h-8 text-xs font-bold rounded-full border transition focus-ring ${feedbackInput.score === star ? 'bg-primary text-white border-primary' : 'bg-surface-elevated text-text-muted border-border hover:bg-surface-hover'}`}>{star}</button>
                      ))}
                    </div>
                  </div>
                  <input type="text" placeholder="Feedback (required on rejection)..." value={feedbackInput.comment} onChange={(e) => setFeedbackInput(prev => ({ ...prev, comment: e.target.value }))} className="w-full text-xs bg-surface-elevated border border-border rounded-lg p-3 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring text-text-primary" />
                  <div className="flex gap-2">
                    <button onClick={() => onResolutionResponse(true)} className="px-5 py-2 bg-success hover:bg-success-dark text-white rounded-lg text-xs font-semibold transition focus-ring">Accept & Close</button>
                    <button onClick={() => onResolutionResponse(false)} className="px-5 py-2 bg-surface-elevated text-error border border-error rounded-lg text-xs font-semibold hover:bg-error-light transition focus-ring">Reject & Reopen</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(activeTicket.status === TicketStatus.RESOLVED || activeTicket.status === TicketStatus.CLOSED) && (activeTicket.rcaDetails || activeTicket.rootCause) && (
          <div className="bg-surface rounded-xl p-6">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Root Cause Analysis</h4>
              <span className="text-[10px] bg-primary-light text-primary-dark px-2 py-0.5 rounded font-mono font-semibold">Auditable</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
              <div className="col-span-2 bg-surface-elevated p-3.5 rounded-lg border border-border">
                <span className="font-semibold text-text-muted text-xs block mb-1">Root Cause</span>
                <p className="text-text-primary leading-relaxed">{activeTicket.rcaDetails?.rootCause || activeTicket.rootCause}</p>
              </div>
              <div className="col-span-2 bg-surface-elevated p-3.5 rounded-lg border border-border">
                <span className="font-semibold text-text-muted text-xs block mb-1">Contributing Factors</span>
                <p className="text-text-primary leading-relaxed">{activeTicket.rcaDetails?.contributingFactors || 'N/A'}</p>
              </div>
              <div className="bg-surface-elevated p-3.5 rounded-lg border border-border">
                <span className="font-semibold text-text-muted text-xs block mb-1">Corrective Actions</span>
                <p className="text-text-primary">{activeTicket.rcaDetails?.correctiveActions || activeTicket.correctiveAction}</p>
              </div>
              <div className="bg-surface-elevated p-3.5 rounded-lg border border-border">
                <span className="font-semibold text-text-muted text-xs block mb-1">Preventive Actions</span>
                <p className="text-text-primary">{activeTicket.rcaDetails?.preventiveActions || 'N/A'}</p>
              </div>
              <div className="bg-surface-elevated p-3.5 rounded-lg border border-border flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
                <div><span className="font-semibold text-text-muted text-xs block">Owner</span><p className="text-text-primary font-semibold text-xs mt-0.5">{activeTicket.rcaDetails?.preventiveOwner || 'N/A'}</p></div>
              </div>
              <div className="bg-surface-elevated p-3.5 rounded-lg border border-border flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-warning-light flex items-center justify-center text-warning shrink-0"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 0 002-2V7a2 0 00-2-2H5a2 0 00-2 2v12a2 0 002 2z" /></svg></div>
                <div><span className="font-semibold text-text-muted text-xs block">Due Date</span><p className="text-text-primary font-mono font-semibold text-xs mt-0.5">{activeTicket.rcaDetails?.preventiveDueDate || 'N/A'}</p></div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
              <span>Verified: <strong className="text-text-primary">{activeTicket.rcaDetails?.resolvedBy || 'N/A'}</strong></span>
              <span>Timestamp: <strong className="text-text-primary">{activeTicket.rcaDetails?.resolvedAt ? new Date(activeTicket.rcaDetails.resolvedAt).toLocaleString() : 'N/A'}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
