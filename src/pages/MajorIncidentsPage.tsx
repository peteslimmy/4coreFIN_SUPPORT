import React, { useState, useEffect } from 'react';
import { Sliders, Plus, X, Activity, AlertTriangle, Lock, FileText, Send, Mail } from 'lucide-react';
import { UserRole } from '../types/app';
import { useApp } from '../context/AppContext';
import { syncTicketUpdate, syncMajorIncidentUpdate } from '../lib/sync';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import Modal from '../components/ui/Modal';

interface MajorIncidentsPageProps {
  selectedMajorIncidentId: string | null;
  setSelectedMajorIncidentId: (id: string | null) => void;
  handleDeclareMajorIncident: (formData: { name: string; description: string; partner: string; category: string; severity: string; initialNotification: string }) => void;
}

function MajorIncidentsPage({ selectedMajorIncidentId, setSelectedMajorIncidentId, handleDeclareMajorIncident }: MajorIncidentsPageProps) {
  const { isLoading, majorIncidents, setMajorIncidents, tickets, setTickets, partners, currentRole, showToast, logAuditAction, saveToStorage, notifyWatchers, comments, auditLogs, currentUser } = useApp();

  const [miTimelineText, setMiTimelineText] = useState('');
  const [showDeclareMajorModal, setShowDeclareMajorModal] = useState(false);
  const [pirFormState, setPirFormState] = useState({
    rootCauseSummary: '', timelineSummary: '', impactSummary: '',
    preventiveOwner: '', preventiveDueDate: ''
  });
  const [pirFormErrors, setPirFormErrors] = useState<Record<string, string>>({});
  const [declareFormErrors, setDeclareFormErrors] = useState<Record<string, string>>({});
  const [newMajorIncidentForm, setNewMajorIncidentForm] = useState({
    name: '', description: '', partner: 'Parkway',
    category: 'Duplicate Debit', severity: 'CRITICAL',
    initialNotification: 'Slack/Teams Webhook'
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const handleLinkTicketToMI = (miId: string, ticketId: string) => {
    const updatedTickets = tickets.map(t => {
      if (t.id === ticketId) {
        logAuditAction(t.id, 'MAJOR_INCIDENT_LINKED', `Ticket linked to Major Incident ID: ${miId}`);
        return { ...t, majorIncidentId: miId };
      }
      return t;
    });
    const updatedMIs = majorIncidents.map(mi => {
      if (mi.id === miId) {
        return { ...mi, ticketCount: updatedTickets.filter(t => t.majorIncidentId === miId).length };
      }
      return mi;
    });
    setTickets(updatedTickets);
    setMajorIncidents(updatedMIs);
    const targetTicket = updatedTickets.find(t => t.id === ticketId);
    if (targetTicket) {
      notifyWatchers(targetTicket, `Ticket ${targetTicket.id} was linked to Major Incident ID: ${miId}.`, updatedTickets);
    } else {
      saveToStorage(updatedTickets, comments, auditLogs, updatedMIs);
    }
    syncTicketUpdate(ticketId, { majorIncidentId: miId });
    const linkedMI = updatedMIs.find(mi => mi.id === miId);
    if (linkedMI) syncMajorIncidentUpdate(miId, { ticketCount: linkedMI.ticketCount });
    showToast(`Ticket ${ticketId} linked successfully to incident ${miId}.`, 'success');
  };

  const handleUnlinkTicketFromMI = (miId: string, ticketId: string) => {
    const updatedTickets = tickets.map(t => {
      if (t.id === ticketId) {
        logAuditAction(t.id, 'MAJOR_INCIDENT_UNLINKED', `Ticket unlinked from Major Incident ID: ${miId}`);
        return { ...t, majorIncidentId: null };
      }
      return t;
    });
    const updatedMIs = majorIncidents.map(mi => {
      if (mi.id === miId) {
        return { ...mi, ticketCount: updatedTickets.filter(t => t.majorIncidentId === miId).length };
      }
      return mi;
    });
    setTickets(updatedTickets);
    setMajorIncidents(updatedMIs);
    const targetTicket = updatedTickets.find(t => t.id === ticketId);
    if (targetTicket) {
      notifyWatchers(targetTicket, `Ticket ${targetTicket.id} was unlinked from Major Incident ID: ${miId}.`, updatedTickets);
    } else {
      saveToStorage(updatedTickets, comments, auditLogs, updatedMIs);
    }
    syncTicketUpdate(ticketId, { majorIncidentId: null });
    const linkedMI = updatedMIs.find(mi => mi.id === miId);
    if (linkedMI) syncMajorIncidentUpdate(miId, { ticketCount: linkedMI.ticketCount });
    showToast(`Ticket ${ticketId} unlinked from incident.`, 'info');
  };

  const handleAddTimelineEntry = (miId: string, messageText: string) => {
    if (!messageText.trim()) return;
    const updatedMIs = majorIncidents.map(mi => {
      if (mi.id === miId) {
        const newEntry = {
          id: 'tl-' + Date.now(),
          timestamp: new Date().toISOString(),
          author: currentUser.firstName + ' ' + currentUser.lastName,
          role: currentRole === UserRole.PARTNER ? 'Payment Partner' : 'BU Support',
          message: messageText
        };
        return { ...mi, timeline: [...mi.timeline, newEntry] };
      }
      return mi;
    });
    setMajorIncidents(updatedMIs);
    saveToStorage(tickets, comments, auditLogs, updatedMIs);
    const updatedMI = updatedMIs.find(mi => mi.id === miId);
    if (updatedMI) syncMajorIncidentUpdate(miId, { timeline: updatedMI.timeline });
    logAuditAction(null, 'MAJOR_INCIDENT_TIMELINE_ADD', `Added milestone update to Incident ${miId}: "${messageText.slice(0, 40)}..."`);
    showToast('Timeline updated successfully.');
  };

  const handleTriggerMINotification = (miId: string, channel: string) => {
    const updatedMIs = majorIncidents.map(mi => {
      if (mi.id === miId) {
        const newNotif = {
          id: 'not-' + Date.now(),
          timestamp: new Date().toISOString(),
          channel,
          recipient: channel.includes('Slack') ? '#ops-alerts-channel' : 'executive-distribution@company.com',
          subject: `INCIDENT ADVISORY: ${mi.name} Updates`,
          status: 'SENT' as const
        };
        return { ...mi, notifications: [newNotif, ...mi.notifications] };
      }
      return mi;
    });
    setMajorIncidents(updatedMIs);
    saveToStorage(tickets, comments, auditLogs, updatedMIs);
    const updatedMI = updatedMIs.find(mi => mi.id === miId);
    if (updatedMI) syncMajorIncidentUpdate(miId, { notifications: updatedMI.notifications });
    logAuditAction(null, 'MAJOR_INCIDENT_STAKEHOLDER_ALERT', `Triggered alert via ${channel} for Incident ${miId}`);
    showToast(`Alert broadcast successfully via ${channel}.`, 'success');
  };

  const handleSavePIR = (miId: string, rcaSummary: string, timelineSummary: string, impactSummary: string, owner: string, dueDate: string, draft: boolean) => {
    setPirFormErrors({});
    const updatedMIs = majorIncidents.map(mi => {
      if (mi.id === miId) {
        return {
          ...mi,
          status: draft ? mi.status : ('RESOLVED' as const),
          active: draft ? mi.active : false,
          pir: {
            rootCauseSummary: rcaSummary,
            timelineSummary: timelineSummary,
            impactSummary: impactSummary,
            preventiveOwner: owner,
            preventiveDueDate: dueDate,
            draft,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentUser.firstName + ' ' + currentUser.lastName
          }
        };
      }
      return mi;
    });
    setMajorIncidents(updatedMIs);
    saveToStorage(tickets, comments, auditLogs, updatedMIs);
    const updatedMI = updatedMIs.find(mi => mi.id === miId);
    if (updatedMI) syncMajorIncidentUpdate(miId, { status: updatedMI.status, active: updatedMI.active, pir: updatedMI.pir });
    logAuditAction(null, 'MAJOR_INCIDENT_PIR_SAVED', `PIR Document saved for ${miId}. Draft status: ${draft}`);
    showToast(draft ? 'PIR draft saved successfully.' : 'PIR Finalized! Incident marked as closed and resolved.', 'success');
  };

  const handleChangeMIStatus = (miId: string, newStatus: string) => {
    const updatedMIs = majorIncidents.map(mi => {
      if (mi.id === miId) {
        return { ...mi, status: newStatus as typeof mi.status, active: newStatus !== 'CLOSED' && newStatus !== 'RESOLVED' };
      }
      return mi;
    });
    setMajorIncidents(updatedMIs);
    saveToStorage(tickets, comments, auditLogs, updatedMIs);
    const updatedMI = updatedMIs.find(mi => mi.id === miId);
    if (updatedMI) syncMajorIncidentUpdate(miId, { status: updatedMI.status, active: updatedMI.active });
    logAuditAction(null, 'MAJOR_INCIDENT_STATUS_CHANGE', `Incident ${miId} changed status to ${newStatus}`);
    showToast(`Incident status set to ${newStatus}.`, 'info');
  };

  const m = majorIncidents.find(mi => mi.id === selectedMajorIncidentId);

  if (m) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-surface-elevated border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedMajorIncidentId(null)}
              className="p-1.5 hover:bg-surface-hover hover:border-border rounded-full text-text-muted transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer">
              <span className="text-base font-bold">&larr;</span> Command Center
            </button>
            <div className="h-6 w-px bg-border" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-error bg-error-light px-2 py-0.5 rounded border border-error-light uppercase tracking-wider">{m.id}</span>
                <h3 className="font-bold text-base text-text-primary tracking-tight">{m.name}</h3>
              </div>
              <p className="text-xs text-text-muted mt-0.5">Declared by System Operator on {new Date(m.createdAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-text-muted bg-surface px-2.5 py-1 rounded">LIFETIME: {(() => {
              const created = new Date(m.createdAt).getTime();
              const end = m.status === 'CLOSED' || m.status === 'RESOLVED' ? new Date(m.timeline[m.timeline.length - 1]?.timestamp || now).getTime() : now;
              const diff = Math.max(0, end - created);
              const hrs = Math.floor(diff / 3600000);
              const mins = Math.floor((diff % 3600000) / 60000);
              const secs = Math.floor((diff % 60000) / 1000);
              return `${hrs}h ${mins}m ${secs}s`;
            })()}</span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase ${m.active ? 'bg-error text-white' : 'bg-success text-white'}`}>{m.status}</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 lg:divide-x divide-border overflow-hidden bg-surface">
          <div className="p-4 lg:p-6 overflow-y-auto space-y-6 flex flex-col min-h-0">
            <div className="bg-surface-elevated rounded-xl p-5 space-y-4">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-accent" /> Incident Controls
              </h4>
              <div>
                <label className="block text-overline text-text-muted font-bold uppercase mb-1">Update Escalation Status</label>
                <select value={m.status}
                  onChange={(e) => handleChangeMIStatus(m.id, e.target.value)}
                  disabled={currentRole === UserRole.EXECUTIVE}
                  className="w-full bg-surface-elevated border border-border rounded p-2 text-body-sm font-bold text-text-primary focus:ring-1 focus:ring-brand-500">
                  <option value="INVESTIGATING">INVESTIGATING</option>
                  <option value="IDENTIFIED">IDENTIFIED</option>
                  <option value="MONITORING">MONITORING</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-surface p-2.5 rounded border border-border">
                  <span className="text-overline text-text-muted font-bold uppercase block">Affected Payment Partner</span>
                  <span className="font-bold text-text-primary mt-0.5 block">{m.partner}</span>
                </div>
                <div className="bg-surface p-2.5 rounded border border-border">
                  <span className="text-overline text-text-muted font-bold uppercase block">Severity Category</span>
                  <span className="font-bold text-error mt-0.5 block">{m.severity}</span>
                </div>
              </div>
            </div>

<div className="bg-surface-elevated rounded-xl shadow-card p-5 space-y-4 flex-1 flex flex-col overflow-hidden">
              <div>
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-accent" /> Map Complaint to Cluster
                </h4>
                <p className="text-xs text-text-muted mt-1">Associate individual payments tickets to coordinate bulk resolution SLAs.</p>
              </div>
              <div className="flex gap-2">
                <select id="bulk-map-select-el" aria-label="Select ticket to link" className="flex-1 bg-surface border border-border rounded p-2 text-xs font-semibold focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring">
                  <option value="">-- Select Active Complaint --</option>
                  {tickets.filter(t => t.majorIncidentId !== m.id).map(t => (
                    <option key={t.id} value={t.id}>{t.id} - {t.customerName} ({t.category})</option>
                  ))}
                </select>
                <button onClick={() => {
                  const selectEl = document.getElementById('bulk-map-select-el') as HTMLSelectElement | null;
                  const tId = selectEl?.value;
                  if (!tId) { showToast('Please select a ticket record first.', 'error'); return; }
                  handleLinkTicketToMI(m.id, tId);
                  if (selectEl) selectEl.value = '';
                }} className="px-3.5 bg-accent hover:bg-accent-light text-white text-xs font-semibold rounded transition-all cursor-pointer focus-ring">Link</button>
              </div>
              <div className="border-t border-border pt-6 flex-1 flex flex-col overflow-hidden">
                <span className="text-overline text-text-muted font-bold uppercase tracking-widest block mb-6">Associated Tickets ({tickets.filter(t => t.majorIncidentId === m.id).length})</span>
                <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                  {tickets.filter(t => t.majorIncidentId === m.id).length === 0 ? (
                    <p className="text-xs text-text-muted italic text-center py-6 bg-surface rounded border border-dashed">No individual customer complaints mapped to this major incident cluster yet.</p>
                  ) : (
                    tickets.filter(t => t.majorIncidentId === m.id).map(t => (
                      <div key={t.id} className="bg-surface hover:bg-surface-hover p-2.5 rounded-lg border border-border flex items-start justify-between gap-3 text-xs transition">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-overline font-bold text-accent">{t.id}</span>
                            <span className="text-overline bg-error-light text-error font-bold px-1 rounded">{t.priority}</span>
                          </div>
                          <p className="font-semibold text-text-primary truncate">{t.customerName}</p>
                          <p className="text-overline text-text-muted truncate">{t.description}</p>
                        </div>
                        <button onClick={() => handleUnlinkTicketFromMI(m.id, t.id)} aria-label="Unlink ticket from incident" className="text-text-muted hover:text-error p-1 rounded hover:bg-surface-hover transition focus-ring" title="Unlink and handle individually"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 lg:p-6 overflow-y-auto flex flex-col min-h-0 bg-surface">
            <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-error" /> Emergency Milestone Timeline
              </h4>
              <span className="text-[10px] bg-error-light text-error-dark font-bold px-1.5 py-0.5 rounded">REAL-TIME TRACKING</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-1">
              {m.timeline.length === 0 ? (
                <p className="text-xs text-text-muted italic text-center py-10">No milestones posted. Type below to create an entry.</p>
              ) : (
                m.timeline.slice().reverse().map((entry) => (
                  <div key={entry.id} className="relative pl-6 border-l-2 border-border text-xs">
                    <div className="absolute -left-[6px] top-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface shadow"></div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-text-primary">{entry.author}</span>
                      <span className="text-overline bg-surface text-text-muted px-1 rounded uppercase tracking-wider font-bold">{entry.role}</span>
                      <span className="text-overline text-text-muted ml-auto font-mono">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <p className="text-text-primary leading-relaxed bg-surface p-2 rounded border border-border font-medium">{entry.message}</p>
                  </div>
                ))
              )}
            </div>
            <div className="pt-4 border-t border-border shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); if (!miTimelineText.trim()) return; handleAddTimelineEntry(m.id, miTimelineText); setMiTimelineText(''); }}
                className="flex gap-2">
                <input type="text" placeholder="Add incident update bulletin (e.g. restoration confirmed)..." value={miTimelineText} onChange={(e) => setMiTimelineText(e.target.value)}
                  className="flex-1 border border-border rounded p-2.5 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-medium" />
                <button type="submit" className="px-4 bg-accent hover:bg-accent-light text-white font-semibold text-xs rounded transition cursor-pointer shrink-0">Post Entry</button>
              </form>
            </div>
          </div>

          <div className="p-4 lg:p-6 overflow-y-auto space-y-6 flex flex-col min-h-0">
            <div className="bg-surface-elevated rounded-xl shadow-card p-5 space-y-4 shrink-0">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-text-muted" /> Emergency Advisory Broadcasts
              </h4>
              <p className="text-caption text-text-secondary">Trigger authorized real-time alerts to external operations systems and executives.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button onClick={() => handleTriggerMINotification(m.id, 'Slack/Teams Webhook')}
                  className="px-3 py-2 bg-text-primary hover:bg-text-secondary text-white rounded text-overline font-bold uppercase transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm border border-text-secondary">
                  <Send className="w-3.5 h-3.5" /> Slack Webhook
                </button>
                <button onClick={() => handleTriggerMINotification(m.id, 'Executive Email Distribution')}
                  className="px-3 py-2 bg-accent hover:bg-accent-light text-white rounded text-overline font-bold uppercase transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm">
                  <Mail className="w-3.5 h-3.5" /> Email Advisory
                </button>
              </div>
              {m.notifications && m.notifications.length > 0 && (
                <div className="border-t border-border pt-3 space-y-2">
                  <span className="text-overline text-text-muted font-bold uppercase tracking-wider block">Dispatched Advisories:</span>
                  <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                    {m.notifications.map((n) => (
                      <div key={n.id} className="flex justify-between items-center bg-surface p-1.5 rounded text-overline text-text-secondary border border-border font-semibold">
                        <span className="truncate">{n.channel}: {n.recipient}</span>
                        <span className="text-overline text-success font-mono uppercase bg-success-light px-1 rounded">Sent</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-surface-elevated rounded-xl shadow-card p-5 space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-info" /> PIR Documentation Desk
                  </h4>
                </div>
                <p className="text-caption text-text-secondary mt-2">Review technical findings and draft the mandatory Post-Incident Review (PIR). Finalizing the PIR closes the incident.</p>
              </div>

              {m.pir && !m.pir.draft ? (
                <div className="bg-gradient-to-br from-success-light to-accent-light/20 border border-success rounded-lg p-4 space-y-3 text-xs flex-1 overflow-y-auto mt-3 border-emerald-200/50">
                  <div className="flex items-center justify-between text-success-dark font-bold">
                    <span>âœ“ PIR Finalized and Closed</span>
                  </div>
                  <div className="space-y-2">
                    <div><span className="font-bold text-text-secondary text-overline uppercase">Technical Root Cause Summary:</span><p className="text-text-primary font-medium">{m.pir.rootCauseSummary}</p></div>
                    <div><span className="font-bold text-text-secondary text-overline uppercase">Impact Assessment:</span><p className="text-text-primary font-medium">{m.pir.impactSummary}</p></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-overline">
                      <div className="bg-surface-elevated p-1.5 rounded border border-border-subtle"><span className="font-bold text-text-muted block uppercase font-bold">Preventive Owner</span><span className="font-bold text-text-primary">{m.pir.preventiveOwner}</span></div>
                      <div className="bg-surface-elevated p-1.5 rounded border border-border-subtle"><span className="font-bold text-text-muted block uppercase font-bold">Due Date</span><span className="font-mono text-text-primary">{m.pir.preventiveDueDate}</span></div>
                    </div>
                  </div>
                  <p className="text-overline text-text-muted text-right pt-2 border-t border-border">Signed: {m.pir.lastUpdatedBy} on {new Date(m.pir.lastUpdated).toLocaleDateString()}</p>
                </div>
              ) : (
                <div className="space-y-3.5 flex-1 overflow-y-auto mt-3 pr-1 text-xs">
                  {m.pir && m.pir.draft && (
                    <div className="p-2 bg-warning-light border border-warning rounded text-overline text-warning-dark font-bold">&#9888; Draft in progress saved by {m.pir.lastUpdatedBy}</div>
                  )}
                  <div className="space-y-3">
                    <div><label className="block text-overline text-text-muted font-bold uppercase mb-1">1. Technical Root Cause Summary</label>
                      <textarea rows={2} placeholder="e.g. Buffer leak in callback routers caused duplicate webhook events." value={pirFormState.rootCauseSummary} onChange={(e) => { setPirFormState(prev => ({ ...prev, rootCauseSummary: e.target.value })); setPirFormErrors(prev => { const n = { ...prev }; delete n.rootCauseSummary; return n; }); }} className={`w-full bg-surface border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary ${pirFormErrors.rootCauseSummary ? 'border-error' : 'border-border'}`} aria-invalid={!!pirFormErrors.rootCauseSummary} />
                      {pirFormErrors.rootCauseSummary && <p className="text-xs text-error mt-1" role="alert">{pirFormErrors.rootCauseSummary}</p>}
                    </div>
                    <div><label className="block text-overline text-text-muted font-bold uppercase mb-1">2. Chronological Milestones Summary</label>
                      <textarea rows={2} placeholder="e.g. 14:02 Outage detected; 14:15 Failover initiated; 14:35 Restoration complete." value={pirFormState.timelineSummary} onChange={(e) => setPirFormState(prev => ({ ...prev, timelineSummary: e.target.value }))} className="w-full bg-surface border border-border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary" />
                    </div>
                    <div><label className="block text-overline text-text-muted font-bold uppercase mb-1">3. Customer Impact & Refund Release Assessment</label>
                      <textarea rows={2} placeholder="e.g. Affected 142 POS checkouts, total USD 4,120 in double debits. All automatic releases executed." value={pirFormState.impactSummary} onChange={(e) => setPirFormState(prev => ({ ...prev, impactSummary: e.target.value }))} className="w-full bg-surface border border-border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><label className="block text-overline text-text-muted font-bold uppercase mb-1">4. Preventive Measures Owner</label>
                        <input type="text" placeholder="e.g. Platform Integrity Team" value={pirFormState.preventiveOwner} onChange={(e) => { setPirFormState(prev => ({ ...prev, preventiveOwner: e.target.value })); setPirFormErrors(prev => { const n = { ...prev }; delete n.preventiveOwner; return n; }); }} className={`w-full bg-surface border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary ${pirFormErrors.preventiveOwner ? 'border-error' : 'border-border'}`} aria-invalid={!!pirFormErrors.preventiveOwner} />
                        {pirFormErrors.preventiveOwner && <p className="text-xs text-error mt-1" role="alert">{pirFormErrors.preventiveOwner}</p>}
                      </div>
                      <div><label className="block text-overline text-text-muted font-bold uppercase mb-1">5. Remediation Due Date</label>
                        <input type="date" value={pirFormState.preventiveDueDate} onChange={(e) => setPirFormState(prev => ({ ...prev, preventiveDueDate: e.target.value }))} className="w-full bg-surface border border-border rounded p-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none transition-all duration-200 focus-ring font-semibold text-text-primary" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-border shrink-0">
                    <button onClick={() => handleSavePIR(m.id, pirFormState.rootCauseSummary, pirFormState.timelineSummary, pirFormState.impactSummary, pirFormState.preventiveOwner, pirFormState.preventiveDueDate, true)}
                      className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded text-xs font-bold transition shadow-sm cursor-pointer text-center">Save Draft</button>
                    <button onClick={() => {
                      const errs: Record<string, string> = {};
                      if (!pirFormState.rootCauseSummary.trim()) errs.rootCauseSummary = 'Root cause is required';
                      if (!pirFormState.preventiveOwner.trim()) errs.preventiveOwner = 'Owner is required';
                      setPirFormErrors(errs);
                      if (Object.keys(errs).length > 0) return;
                      handleSavePIR(m.id, pirFormState.rootCauseSummary, pirFormState.timelineSummary, pirFormState.impactSummary, pirFormState.preventiveOwner, pirFormState.preventiveDueDate, false);
                    }} className="flex-1 py-2 bg-success hover:bg-success-dark text-white rounded text-xs font-bold transition shadow-sm cursor-pointer text-center">Finalize & Close</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <PageContainer maxWidth="full" className="space-y-6">
        <PageHeader
          title="Major Incidents Command Center"
          subtitle="Coordinate response for systemic payments outages, auto-link recurring issues, and alert stakeholders"
          breadcrumbs={[{ label: 'Home' }, { label: 'Operations' }, { label: 'Major Incidents' }]}
          actions={
            <button onClick={() => { setNewMajorIncidentForm({ name: '', description: '', partner: 'Parkway', category: 'Duplicate Debit', severity: 'CRITICAL', initialNotification: 'Slack/Teams Webhook' }); setShowDeclareMajorModal(true); }}
              className="px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow cursor-pointer">
              <AlertTriangle className="w-4 h-4" /> Declare Major Incident
            </button>
          }
        />

      {showDeclareMajorModal && (
        <Modal
          open={showDeclareMajorModal}
          onClose={() => { setShowDeclareMajorModal(false); setDeclareFormErrors({}); }}
          title="Declare New Systemic Major Incident"
          footer={
            <div className="flex gap-2">
              <button onClick={() => { if (!newMajorIncidentForm.name.trim()) { setDeclareFormErrors({ name: 'Incident name is required' }); return; } setDeclareFormErrors({}); handleDeclareMajorIncident(newMajorIncidentForm); }}
                className="px-4 py-2 bg-error hover:bg-error-dark text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <Activity className="w-4 h-4" /> Declare Emergency Incident
              </button>
              <button onClick={() => { setShowDeclareMajorModal(false); setDeclareFormErrors({}); }} className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded text-xs cursor-pointer">Cancel</button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-text-primary">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Incident Name / Subject</label>
              <input type="text" placeholder="e.g. Parkway API Settlement Delay APAC" value={newMajorIncidentForm.name} onChange={(e) => { setNewMajorIncidentForm(prev => ({ ...prev, name: e.target.value })); setDeclareFormErrors(prev => { const n = { ...prev }; delete n.name; return n; }); }} className={`w-full border rounded p-2 text-xs focus-ring transition-all duration-200 outline-none focus-ring text-text-primary ${declareFormErrors.name ? 'border-error bg-surface-elevated' : 'border-border bg-surface-elevated'}`} aria-invalid={!!declareFormErrors.name} />
              {declareFormErrors.name && <p className="text-xs text-error mt-1" role="alert">{declareFormErrors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Affected Payment Partner</label>
              <select value={newMajorIncidentForm.partner} onChange={(e) => setNewMajorIncidentForm(prev => ({ ...prev, partner: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs focus-ring transition-all duration-200 outline-none transition-all duration-200 focus-ring text-text-primary">
                {partners.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Incident Severity Level</label>
              <select value={newMajorIncidentForm.severity} onChange={(e) => setNewMajorIncidentForm(prev => ({ ...prev, severity: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs focus-ring transition-all duration-200 outline-none transition-all duration-200 focus-ring text-text-primary font-semibold">
                <option value="CRITICAL">SEV-1 Critical Outage</option>
                <option value="HIGH">SEV-2 High Impact</option>
                <option value="MEDIUM">SEV-3 Moderate Degradation</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Initial Stakeholder Notification</label>
              <select value={newMajorIncidentForm.initialNotification} onChange={(e) => setNewMajorIncidentForm(prev => ({ ...prev, initialNotification: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs focus-ring transition-all duration-200 outline-none transition-all duration-200 focus-ring text-text-primary">
                <option value="Slack/Teams Webhook">All Hands: Broadcast to #ops-alerts Slack Channel</option>
                <option value="Executive Advisory">Executive Advisory: Send Email to board@company.com</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-1">Operational Description / Initial Findings</label>
              <textarea rows={2} placeholder="e.g. Adyen bulk checkout callbacks are erroring with HTTP 504. Investigating middleware buffer timeouts." value={newMajorIncidentForm.description} onChange={(e) => setNewMajorIncidentForm(prev => ({ ...prev, description: e.target.value }))} className="w-full bg-surface-elevated border border-border rounded p-2 text-xs focus-ring transition-all duration-200 outline-none transition-all duration-200 focus-ring text-text-primary" />
            </div>
          </div>
        </Modal>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton variant="card" count={3} />
          </div>
        ) : majorIncidents.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={<Activity className="w-12 h-12" />} title="No active system outages or major incidents registered" message="Declare a major incident to link complaints and manage bulk communications." />
          </div>
        ) : (
          majorIncidents.map(m => {
            const linkedCount = tickets.filter(t => t.majorIncidentId === m.id).length;
            return (
              <div key={m.id} className="bg-surface-elevated rounded-xl shadow-card p-5 relative overflow-hidden flex flex-col justify-between hover:shadow-md transition duration-250">
                <div className={`absolute top-0 left-0 w-full h-1.5 ${m.severity === 'CRITICAL' ? 'bg-error' : 'bg-warning'}`} />
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-text-muted bg-surface px-2 py-0.5 rounded border border-border">{m.id}</span>
                    <span className={`text-overline font-semibold px-2 py-0.5 rounded-full uppercase ${m.active ? 'bg-error-light text-error-dark border border-error-light' : 'bg-success-light text-success-dark border border-success-light'}`}>{m.status}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-text-primary leading-tight mb-1">{m.name}</h4>
                    <p className="text-xs text-text-secondary line-clamp-2 italic">"{m.description || 'No initial findings provided.'}"</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-overline text-text-secondary font-semibold bg-surface p-2 rounded">
                    <div><span className="text-text-muted block uppercase text-overline">Vendor</span><span className="text-text-primary font-bold">{m.partner}</span></div>
                    <div><span className="text-text-muted block uppercase text-overline">Severity</span><span className="text-error font-bold">{m.severity}</span></div>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-border flex justify-between items-center shrink-0">
                  <span className="text-overline text-text-muted font-bold uppercase tracking-wider">{linkedCount} Linked Complaints</span>
                  <button onClick={() => setSelectedMajorIncidentId(m.id)} className="text-xs font-bold text-info hover:text-info transition flex items-center gap-1 cursor-pointer">Command Room âž”</button>
                </div>
              </div>
            );
          })
        )}
      </div>
      </PageContainer>
    </PageTransition>
  );
}

export default React.memo(MajorIncidentsPage);
