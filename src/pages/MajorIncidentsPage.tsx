import React, { useState, useEffect } from 'react';
import { AlertTriangle, Activity } from 'lucide-react';
import { UserRole } from '../types/app';
import { useApp } from '../context/AppContext';
import { syncTicketUpdate, syncMajorIncidentUpdate } from '../lib/sync';
import { api } from '../lib/api';
import { transitionBlocked, closeRequires } from '../lib/majorIncidentStateMachine';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import IncidentCard from '../components/major-incidents/IncidentCard';
import IncidentLifecycleControls from '../components/major-incidents/IncidentLifecycleControls';
import IncidentTicketMapper from '../components/major-incidents/IncidentTicketMapper';
import IncidentTimeline from '../components/major-incidents/IncidentTimeline';
import IncidentAdvisoryBroadcasts from '../components/major-incidents/IncidentAdvisoryBroadcasts';
import IncidentPIRDesk from '../components/major-incidents/IncidentPIRDesk';
import DeclareIncidentModal from '../components/major-incidents/DeclareIncidentModal';

interface MajorIncidentsPageProps {
  selectedMajorIncidentId: string | null;
  setSelectedMajorIncidentId: (id: string | null) => void;
  handleDeclareMajorIncident: (formData: {
    name: string;
    description: string;
    partner: string;
    category: string;
    severity: string;
    initialNotification: string;
    affectedPartners?: string[];
    affectedBus?: string[];
    impact?: { description: string; customerCount?: string; amount?: string };
    expectedRto?: string;
    severityJustification?: string;
    recipient?: string;
    links?: string[];
  }) => Promise<string | undefined>;
}

function MajorIncidentsPage({ selectedMajorIncidentId, setSelectedMajorIncidentId, handleDeclareMajorIncident }: MajorIncidentsPageProps) {
  const { isLoading, majorIncidents, setMajorIncidents, tickets, setTickets, partners, businessUnits, currentRole, showToast, logAuditAction, saveToStorage, notifyWatchers, comments, auditLogs, currentUser, can } = useApp();

  const [showDeclareMajorModal, setShowDeclareMajorModal] = useState(false);
  const [declareStep, setDeclareStep] = useState<1 | 2>(1);
  const [isSubmittingDeclare, setIsSubmittingDeclare] = useState(false);
  const [pirFormState, setPirFormState] = useState({
    rootCauseSummary: '', timelineSummary: '', impactSummary: '',
    preventiveOwner: '', preventiveDueDate: ''
  });
  const [pirFormErrors, setPirFormErrors] = useState<Record<string, string>>({});
  const [declareFormErrors, setDeclareFormErrors] = useState<Record<string, string>>({});
  const [newMajorIncidentForm, setNewMajorIncidentForm] = useState({
    name: '', description: '', partner: 'Parkway',
    category: 'Duplicate Debit', severity: 'CRITICAL',
    initialNotification: 'Slack/Teams Webhook',
    affectedPartners: [] as string[],
    affectedBus: [] as string[],
    severityJustification: '',
    expectedRto: '',
    confirmDeclaration: false,
  });
  const [retryingNotifId, setRetryingNotifId] = useState<string | null>(null);

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

  const handleRetryNotification = async (miId: string, notifId: string) => {
    setRetryingNotifId(notifId);
    try {
      const updated = await api.retryMajorIncidentNotification(miId, notifId);
      setMajorIncidents(prev => prev.map(m => (m.id === miId ? updated : m)));
      showToast('Advisory re-dispatched.', 'success');
      logAuditAction(null, 'MAJOR_INCIDENT_STAKEHOLDER_ALERT', `Retried advisory ${notifId} for Incident ${miId}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to re-dispatch advisory.';
      showToast(message, 'error');
    } finally {
      setRetryingNotifId(null);
    }
  };

  const handleSavePIR = async (miId: string, rcaSummary: string, timelineSummary: string, impactSummary: string, owner: string, dueDate: string, draft: boolean) => {
    setPirFormErrors({});
    const mi = majorIncidents.find(x => x.id === miId);
    if (!mi) return;
    const pir = {
      rootCauseSummary: rcaSummary,
      timelineSummary,
      impactSummary,
      preventiveOwner: owner,
      preventiveDueDate: dueDate,
      draft,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: currentUser.firstName + ' ' + currentUser.lastName
    };
    try {
      const updated = await api.updateMajorIncident(miId, { pir });
      setMajorIncidents(prev => prev.map(m => (m.id === miId ? updated : m)));
      logAuditAction(null, 'MAJOR_INCIDENT_PIR_SAVED', `PIR Document saved for ${miId}. Draft status: ${draft}`);
      showToast(draft ? 'PIR draft saved successfully.' : 'PIR finalized — incident is now eligible to be closed.', 'success');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to save the PIR.';
      showToast(message, 'error');
    }
  };

  const transitionIncident = async (miId: string, target: string) => {
    const mi = majorIncidents.find(x => x.id === miId);
    if (!mi) return;
    const blocker = transitionBlocked(mi, target);
    if (blocker) {
      showToast(blocker, 'error');
      return;
    }
    try {
      const updated = await api.updateMajorIncident(miId, { status: target });
      setMajorIncidents(prev => prev.map(m => (m.id === miId ? updated : m)));
      syncMajorIncidentUpdate(miId, { status: updated.status, active: updated.active, owner: updated.owner, acknowledgedAt: updated.acknowledgedAt });
      logAuditAction(null, 'MAJOR_INCIDENT_STATUS_CHANGE', `Incident ${miId} changed status to ${target}`);
      showToast(`Incident status set to ${target}.`, 'info');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Status could not be changed.';
      showToast(message, 'error');
    }
  };

  const handleAcknowledge = () => {
    if (!m) return;
    transitionIncident(m.id, 'INVESTIGATING');
  };

  const handleFinalizeAndClose = async () => {
    if (!m) return;
    const errs: Record<string, string> = {};
    if (!pirFormState.rootCauseSummary.trim()) errs.rootCauseSummary = 'Root cause is required';
    if (!pirFormState.preventiveOwner.trim()) errs.preventiveOwner = 'Owner is required';
    setPirFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const pir = {
      rootCauseSummary: pirFormState.rootCauseSummary,
      timelineSummary: pirFormState.timelineSummary,
      impactSummary: pirFormState.impactSummary,
      preventiveOwner: pirFormState.preventiveOwner,
      preventiveDueDate: pirFormState.preventiveDueDate,
      draft: false,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: currentUser.firstName + ' ' + currentUser.lastName
    };
    const merged = { ...m, pir };
    const blocker = closeRequires(merged);
    if (blocker) {
      showToast(blocker, 'error');
      return;
    }
    try {
      const updated = await api.updateMajorIncident(m.id, { pir: { ...pir, draft: false, rootCauseSummary: pir.rootCauseSummary.trim(), preventiveOwner: pir.preventiveOwner.trim() }, status: 'CLOSED' });
      setMajorIncidents(prev => prev.map(x => (x.id === m.id ? updated : x)));
      logAuditAction(null, 'MAJOR_INCIDENT_PIR_SAVED', `PIR finalized and incident ${m.id} closed.`);
      showToast('PIR finalized. Incident closed.', 'success');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not finalize the PIR and close the incident.';
      showToast(message, 'error');
    }
  };

  const handleDeclareSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!newMajorIncidentForm.name.trim()) errors.name = 'Incident name is required';
    if (!newMajorIncidentForm.description.trim()) errors.description = 'Incident description is required';
    if (newMajorIncidentForm.affectedPartners.length === 0 && newMajorIncidentForm.affectedBus.length === 0) {
      errors.scope = 'Select at least one affected partner or business unit.';
    }
    if (newMajorIncidentForm.severityJustification && !newMajorIncidentForm.severityJustification.trim()) {
      errors.severityJustification = 'A justification is required when declaring a SEV-1 (CRITICAL) major incident.';
    }
    if (!newMajorIncidentForm.confirmDeclaration) {
      errors.confirmDeclaration = 'Confirm that this is a real, unfolding major incident.';
    }
    setDeclareFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmittingDeclare(true);
    try {
      const createdId = await handleDeclareMajorIncident({
        name: newMajorIncidentForm.name.trim(),
        description: newMajorIncidentForm.description.trim(),
        partner: newMajorIncidentForm.partner,
        category: newMajorIncidentForm.category,
        severity: newMajorIncidentForm.severity,
        initialNotification: newMajorIncidentForm.initialNotification,
        affectedPartners: newMajorIncidentForm.affectedPartners,
        affectedBus: newMajorIncidentForm.affectedBus,
        severityJustification: newMajorIncidentForm.severityJustification.trim(),
        expectedRto: newMajorIncidentForm.expectedRto.trim(),
      });
      setShowDeclareMajorModal(false);
      setDeclareStep(1);
      setNewMajorIncidentForm({
        name: '', description: '', partner: 'Parkway', category: 'Duplicate Debit', severity: 'CRITICAL',
        initialNotification: 'Slack/Teams Webhook', affectedPartners: [], affectedBus: [],
        severityJustification: '', expectedRto: '', confirmDeclaration: false,
      });
      if (createdId) setSelectedMajorIncidentId(createdId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Declaration failed. Please try again.';
      showToast(message, 'error');
    } finally {
      setIsSubmittingDeclare(false);
    }
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
            <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase ${m.active ? 'bg-error text-[#fff]' : 'bg-success text-[#fff]'}`}>{m.status}</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 lg:divide-x divide-border overflow-hidden bg-surface">
          <div className="p-4 lg:p-6 overflow-y-auto space-y-6 flex flex-col min-h-0">
            <IncidentLifecycleControls
              incident={m}
              canManage={can('major-incidents:manage')}
              onTransition={transitionIncident}
              onAcknowledge={handleAcknowledge}
            />
            <IncidentTicketMapper
              incident={m}
              tickets={tickets}
              onLink={handleLinkTicketToMI}
              onUnlink={handleUnlinkTicketFromMI}
              showToast={showToast}
            />
          </div>

          <IncidentTimeline
            incident={m}
            onAddEntry={handleAddTimelineEntry}
          />

          <div className="p-4 lg:p-6 overflow-y-auto space-y-6 flex flex-col min-h-0">
            <IncidentAdvisoryBroadcasts
              incident={m}
              canManage={can('major-incidents:manage')}
              retryingNotifId={retryingNotifId}
              onRetry={handleRetryNotification}
            />
            <IncidentPIRDesk
              incident={m}
              pirFormState={pirFormState}
              pirFormErrors={pirFormErrors}
              onPirFormChange={setPirFormState}
              onPirFormErrorClear={(field) => setPirFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; })}
              onSaveDraft={(miId) => handleSavePIR(miId, pirFormState.rootCauseSummary, pirFormState.timelineSummary, pirFormState.impactSummary, pirFormState.preventiveOwner, pirFormState.preventiveDueDate, true)}
              onFinalizeAndClose={handleFinalizeAndClose}
            />
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
            can('major-incidents:declare') ? (
              <button onClick={() => { setDeclareStep(1); setDeclareFormErrors({}); setNewMajorIncidentForm({ name: '', description: '', partner: partners[0] || 'Parkway', category: 'Duplicate Debit', severity: 'CRITICAL', initialNotification: 'Slack/Teams Webhook', affectedPartners: [], affectedBus: [], severityJustification: '', expectedRto: '', confirmDeclaration: false }); setShowDeclareMajorModal(true); }}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-[#fff] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow cursor-pointer">
                <AlertTriangle className="w-4 h-4" /> Declare Major Incident
              </button>
            ) : null
          }
        />

        <DeclareIncidentModal
          open={showDeclareMajorModal}
          onClose={() => { setShowDeclareMajorModal(false); setDeclareFormErrors({}); setDeclareStep(1); }}
          step={declareStep}
          onStepChange={(step) => { setDeclareStep(step); setDeclareFormErrors({}); }}
          form={newMajorIncidentForm}
          onFormChange={setNewMajorIncidentForm}
          formErrors={declareFormErrors}
          onErrorClear={(field) => setDeclareFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; })}
          onSubmit={handleDeclareSubmit}
          isSubmitting={isSubmittingDeclare}
          partners={partners}
          businessUnits={businessUnits}
        />

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
            majorIncidents.map(mi => {
              const linkedCount = tickets.filter(t => t.majorIncidentId === mi.id).length;
              return (
                <IncidentCard key={mi.id} incident={mi} linkedCount={linkedCount} onSelect={setSelectedMajorIncidentId} />
              );
            })
          )}
        </div>
      </PageContainer>
    </PageTransition>
  );
}

export default React.memo(MajorIncidentsPage);
