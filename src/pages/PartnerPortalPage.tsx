import React, { useState, useMemo } from 'react';
import { ClipboardList, Search, CheckCircle, AlertTriangle, BarChart2, Activity, Star, Send, FileText } from 'lucide-react';
import { TicketStatus, type TicketRecord } from '../types/app';
import { useApp } from '../context/AppContext';
import { syncTicketPatch } from '../lib/sync';
import StatusBadge from '../components/ui/StatusBadge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

export default function PartnerPortalPage() {
  const {
    isLoading, setTickets, currentUser, showToast,
    logAuditAction, getScopedTickets, evidence,
    transitionTicket, getAvailableTicketTransitions,
  } = useApp();

  const scopedTickets = getScopedTickets();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRca, setExpandedRca] = useState<string | null>(null);
  const [rcaForm, setRcaForm] = useState({ rootCause: '', correctiveAction: '', preventiveAction: '', notes: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const partnerName = currentUser.bu;
  const partnerTickets = useMemo(() =>
    scopedTickets.filter(t =>
      t.partner.toLowerCase() === partnerName.toLowerCase() &&
      (t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
       t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
       t.category.toLowerCase().includes(searchQuery.toLowerCase()))
    ),
    [scopedTickets, partnerName, searchQuery]
  );

  const activeInvestigations = partnerTickets.filter(t => t.status === TicketStatus.INVESTIGATE).length;
  const pendingRca = partnerTickets.filter(t => t.status === TicketStatus.INVESTIGATE && !t.rootCause).length;
  const resolvedCount = partnerTickets.filter(t => t.status === TicketStatus.RESOLVED || t.status === TicketStatus.CLOSED).length;
  const avgSatisfaction = (() => {
    const rated = partnerTickets.filter(t => t.feedbackScore !== null);
    if (rated.length === 0) return 'N/A';
    return (rated.reduce((sum, t) => sum + (t.feedbackScore || 0), 0) / rated.length).toFixed(1) + ' / 5';
  })();

  const handleBeginInvestigation = async (ticket: TicketRecord) => {
    const available = getAvailableTicketTransitions(ticket);
    if (!available.some(r => r.to === TicketStatus.INVESTIGATE)) {
      showToast(`Investigations can't be started from "${ticket.status}".`, 'error');
      return;
    }
    try {
      await transitionTicket(ticket.id, TicketStatus.INVESTIGATE);
      showToast(`Investigation started for ${ticket.id}`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start investigation.';
      showToast(msg, 'error');
    }
  };

  const handleAcknowledge = async (ticket: TicketRecord) => {
    const available = getAvailableTicketTransitions(ticket);
    if (!available.some(r => r.to === TicketStatus.ASSIGNED)) {
      showToast(`Ticket is not in a state where it can be acknowledged (${ticket.status}).`, 'error');
      return;
    }
    try {
      await transitionTicket(ticket.id, TicketStatus.ASSIGNED);
      showToast(`Ticket ${ticket.id} acknowledged`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not acknowledge ticket.';
      showToast(msg, 'error');
    }
  };

  const handleCloseTicket = async (ticket: TicketRecord) => {
    // Partners resolve; closing for validation is reserved for BU Support.
    // Route through the machine so policy is enforced, not silently violated.
    const available = getAvailableTicketTransitions(ticket);
    if (!available.some(r => r.to === TicketStatus.CLOSED)) {
      const allowed = available.map(r => r.label).join(', ') || 'none';
      showToast(
        `Partners cannot close directly. Available actions from "${ticket.status}": ${allowed || 'none'}. Resolve first; BU Support will close.`,
        'error'
      );
      return;
    }
    try {
      await transitionTicket(ticket.id, TicketStatus.CLOSED);
      showToast(`Ticket ${ticket.id} closed`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not close ticket.';
      showToast(msg, 'error');
    }
  };

  const clearError = (field: string) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const handleSubmitRca = async (ticket: TicketRecord) => {
    const errs: Record<string, string> = {};
    if (!rcaForm.rootCause.trim()) errs.rootCause = 'Root cause is required';
    if (!rcaForm.correctiveAction.trim()) errs.correctiveAction = 'Corrective action is required';
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const available = getAvailableTicketTransitions(ticket);
    if (!available.some(r => r.to === TicketStatus.RESOLVED)) {
      showToast(`Resolution can't be declared from "${ticket.status}".`, 'error');
      return;
    }

    const rcaDetails = {
      rootCause: rcaForm.rootCause,
      contributingFactors: rcaForm.notes,
      correctiveActions: rcaForm.correctiveAction,
      preventiveActions: rcaForm.preventiveAction,
      preventiveOwner: currentUser.firstName + ' ' + currentUser.lastName,
      preventiveDueDate: new Date().toISOString(),
    };
    // Pre-persist RCA so the machine's required-field checks validate it.
    setTickets(ts =>
      ts.map(t =>
        t.id === ticket.id
          ? {
              ...t,
              rootCause: rcaForm.rootCause,
              correctiveAction: rcaForm.correctiveAction,
              rcaDetails,
            }
          : t
      )
    );
    logAuditAction(ticket.id, 'PARTNER_SUBMIT_RCA', `Partner ${currentUser.firstName + ' ' + currentUser.lastName} submitted RCA for ticket ${ticket.id}`);
    try {
      const resolved = await transitionTicket(ticket.id, TicketStatus.RESOLVED);
      syncTicketPatch(ticket.id, { status: resolved.status, rootCause: resolved.rootCause, correctiveAction: resolved.correctiveAction, rcaDetails: resolved.rcaDetails });
      showToast(`RCA submitted for ${ticket.id}. Ticket moved to RESOLVED.`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not resolve ticket.';
      showToast(msg, 'error');
    }
    setExpandedRca(null);
    setFormErrors({});
    setRcaForm({ rootCause: '', correctiveAction: '', preventiveAction: '', notes: '' });
  };

  return (
    <PageTransition>
      <PageContainer maxWidth="full" className="space-y-6">
        <PageHeader
          title={`Partner Portal - ${partnerName}`}
          subtitle="Investigation queue, RCA submission, and resolution dashboard"
          breadcrumbs={[{ label: 'Home' }, { label: 'Partner Portal' }]}
          actions={
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-accent" />
            </div>
          }
        />

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton variant="card" count={4} />
        </div>
) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface-elevated rounded-xl p-6">
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  <Activity className="w-4 h-4 text-accent" /> Active Investigations
                </div>
                <span className="text-xl font-bold text-text-primary">{activeInvestigations}</span>
              </div>
              <div className="bg-surface-elevated rounded-xl p-6">
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  <AlertTriangle className="w-4 h-4 text-warning" /> Pending RCA
                </div>
                <span className="text-xl font-bold text-text-primary">{pendingRca}</span>
              </div>
              <div className="bg-surface-elevated rounded-xl p-6">
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  <CheckCircle className="w-4 h-4 text-success" /> Resolved
                </div>
                <span className="text-xl font-bold text-text-primary">{resolvedCount}</span>
              </div>
              <div className="bg-surface-elevated rounded-xl p-6">
                <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                  <Star className="w-4 h-4 text-warning" /> Satisfaction
                </div>
                <span className="text-xl font-bold text-text-primary">{avgSatisfaction}</span>
              </div>
            </div>

            <div className="bg-surface-elevated rounded-xl">
            <div className="p-5 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-text-primary">Investigation Queue</h4>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by ID, customer, category..."
                    className="bg-surface border border-border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all duration-200 focus-ring w-64"
                  />
                </div>
              </div>
            </div>

            {partnerTickets.length === 0 ? (
              <EmptyState icon={<ClipboardList className="w-12 h-12" />} title="No tickets assigned" message={`No tickets are currently assigned to ${partnerName}.`} />
            ) : (
              <div className="divide-y divide-border">
                {partnerTickets.map(ticket => (
                  <div key={ticket.id} className="p-5 hover:bg-surface-hover transition">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-text-primary text-sm">{ticket.id}</span>
                          <StatusBadge priority={ticket.priority} size="sm" />
                          <StatusBadge status={ticket.status} size="sm" />
                        </div>
                        <p className="text-xs text-text-muted truncate">{ticket.customerName} - {ticket.category}</p>
                        <p className="text-xs text-text-muted mt-1 line-clamp-2">{ticket.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      {ticket.status === TicketStatus.RECEIPT ? (
                        <button
                          onClick={() => handleAcknowledge(ticket)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent hover:text-accent-light hover:bg-primary-light transition cursor-pointer"
                        >
                          <Search className="w-3 h-3" /> Acknowledge
                        </button>
                      ) : null}

                      {ticket.status === TicketStatus.ASSIGNED ? (
                        <button
                          onClick={() => handleBeginInvestigation(ticket)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent hover:text-accent-dark hover:bg-surface-hover transition cursor-pointer"
                        >
                          <Search className="w-3 h-3" /> Begin Investigation
                        </button>
                      ) : null}

                      {ticket.status === TicketStatus.INVESTIGATE && (
                        <button
                          onClick={() => {
                            setExpandedRca(expandedRca === ticket.id ? null : ticket.id);
                            setRcaForm({
                              rootCause: ticket.rootCause || '',
                              correctiveAction: ticket.correctiveAction || '',
                              preventiveAction: ticket.rcaDetails?.preventiveActions || '',
                              notes: ticket.rcaDetails?.contributingFactors || '',
                            });
                            setFormErrors({});
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-accent hover:text-accent-light hover:bg-primary-light transition cursor-pointer"
                        >
                          <BarChart2 className="w-3 h-3" /> {ticket.rootCause ? 'Update RCA' : 'Submit RCA'}
                        </button>
                      )}

                      {ticket.status === TicketStatus.RESOLVED ? (
                        <button
                          onClick={() => handleCloseTicket(ticket)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-success hover:text-success-dark hover:bg-success-light transition cursor-pointer"
                        >
                          <Search className="w-3 h-3" /> Close Ticket
                        </button>
                      ) : null}

                      <span className="text-[10px] text-text-muted font-medium">
                        Created: {new Date(ticket.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {(() => {
                      const ticketEvs = evidence.filter(e => e.ticketId === ticket.id);
                      if (ticketEvs.length === 0) return null;
                      return (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Evidence:</span>
                          {ticketEvs.map(ev => (
                            ev.url ? (
                              <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2 py-1 bg-surface border border-border rounded text-[10px] font-medium text-text-primary hover:border-accent/30 transition-colors" title={ev.fileName}>
                                {ev.fileType?.startsWith('image/') ? (
                                  <img src={ev.url} alt={ev.fileName} className="w-4 h-4 rounded object-cover" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-text-muted" />
                                )}
                                <span className="max-w-[140px] truncate">{ev.fileName}</span>
                              </a>
                            ) : (
                              <span key={ev.id} className="flex items-center gap-1.5 px-2 py-1 bg-surface border border-border rounded text-[10px] font-medium text-text-primary">
                                <FileText className="w-3.5 h-3.5 text-text-muted" />
                                <span className="max-w-[140px] truncate">{ev.fileName}</span>
                              </span>
                            )
                          ))}
                        </div>
                      );
                    })()}

                    {expandedRca === ticket.id && (
                      <div className="mt-4 bg-surface-elevated border border-border rounded-lg p-4 space-y-3">
                        <h5 className="text-xs font-bold text-text-primary">Root Cause Analysis</h5>
                        <div>
                          <label className="block text-[10px] text-text-muted font-medium uppercase mb-1">Root Cause *</label>
                          <textarea
                            value={rcaForm.rootCause}
                            onChange={(e) => { setRcaForm(prev => ({ ...prev, rootCause: e.target.value })); clearError('rootCause'); }}
                            className={`w-full bg-surface border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-brand-500 ${formErrors.rootCause ? 'border-error' : 'border-border'}`}
                            aria-invalid={!!formErrors.rootCause}
                            rows={2}
                            placeholder="What caused this issue?"
                          />
                          {formErrors.rootCause && <p className="text-xs text-error mt-1" role="alert">{formErrors.rootCause}</p>}
                        </div>
                        <div>
                          <label className="block text-[10px] text-text-muted font-medium uppercase mb-1">Corrective Action *</label>
                          <textarea
                            value={rcaForm.correctiveAction}
                            onChange={(e) => { setRcaForm(prev => ({ ...prev, correctiveAction: e.target.value })); clearError('correctiveAction'); }}
                            className={`w-full bg-surface border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-brand-500 ${formErrors.correctiveAction ? 'border-error' : 'border-border'}`}
                            aria-invalid={!!formErrors.correctiveAction}
                            rows={2}
                            placeholder="What was done to fix it?"
                          />
                          {formErrors.correctiveAction && <p className="text-xs text-error mt-1" role="alert">{formErrors.correctiveAction}</p>}
                        </div>
                        <div>
                          <label className="block text-[10px] text-text-muted font-medium uppercase mb-1">Preventive Action</label>
                          <textarea
                            value={rcaForm.preventiveAction}
                            onChange={(e) => setRcaForm(prev => ({ ...prev, preventiveAction: e.target.value }))}
                            className="w-full bg-surface border border-border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-brand-500"
                            rows={2}
                            placeholder="How to prevent recurrence?"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-text-muted font-medium uppercase mb-1">Contributing Factors / Notes</label>
                          <textarea
                            value={rcaForm.notes}
                            onChange={(e) => setRcaForm(prev => ({ ...prev, notes: e.target.value }))}
                            className="w-full bg-surface border border-border rounded p-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-brand-500"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSubmitRca(ticket)}
                            className="flex items-center gap-1 px-4 py-2 bg-success text-white text-xs font-bold rounded-lg hover:bg-success-dark transition cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" /> Submit & Resolve Ticket
                          </button>
                          <button
                            onClick={() => { setExpandedRca(null); setRcaForm({ rootCause: '', correctiveAction: '', preventiveAction: '', notes: '' }); setFormErrors({}); }}
                            className="px-4 py-2 bg-surface text-text-primary text-xs font-bold rounded-lg hover:bg-surface-hover transition cursor-pointer border border-border"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {ticket.rootCause && expandedRca !== ticket.id && (
                      <div className="mt-3 bg-surface-elevated border border-border rounded p-3 text-xs text-text-muted">
                        <span className="font-bold text-text-primary">RCA:</span> {ticket.rootCause}
                        {ticket.correctiveAction && <span className="ml-2 text-success font-medium">- {ticket.correctiveAction}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      </PageContainer>
    </PageTransition>
  );
}
