import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Ticket, CheckCircle } from 'lucide-react';
import { TicketStatus, TicketPriority, UserRole, type TicketRecord, type AuditLog, type FileEvidence, type CommentRecord } from '../types/app';
import { calculateSlaDeadline } from '../lib/slaCalculator';
import { nextTicketId } from '../../src/lib/buCodes';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { syncCreateTicket, syncTicketUpdate, syncEvidenceUpload, syncComment, syncAudit } from '../lib/sync';
import { compressFiles } from '../lib/imageCompression';
import { parseNaira } from '../lib/currencyFormat';
import { getBuFormConfig, validateFieldValue, N_A_BANK } from '../lib/formConfigs';
import type { FormFieldValue } from '../types/forms';
import { detectDuplicates, buildDuplicatePayload, type DuplicateCandidate } from '../lib/duplicateDetection';
import DuplicateResolutionModal, { type DuplicateChoice } from '../components/forms/DuplicateResolutionModal';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Skeleton from '../components/ui/Skeleton';
import SliderForm from '../components/ui/SliderForm';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import {
  CustomerRecordsView,
  CustomerIdentityStep,
  IncidentDetailsStep,
  TransactionInfoStep,
  DescriptionEvidenceStep,
  ComplaintSuccessModal,
} from '../components/portal';

interface NewTicketForm {
  category: string; priority: string;
  transactionId: string; amount: string; partner: string;
  description: string; terminalId: string;
  bankName: string; nipSessionId: string;
  requiresAmount: 'yes' | 'no';
  customerFirstName: string; customerLastName: string;
  customerEmail: string; customerPhone: string; customerId?: string;
}

const defaultNewTicket: NewTicketForm = {
  category: 'Failed Payment',
  priority: TicketPriority.HIGH,
  transactionId: '',
  amount: '',
  partner: 'Parkway',
  description: '',
  terminalId: '',
  bankName: N_A_BANK,
  nipSessionId: '',
  requiresAmount: 'no',
  customerFirstName: '',
  customerLastName: '',
  customerEmail: '',
  customerPhone: '',
  customerId: undefined,
};

export default function CustomerPortalPage() {
  const {
    isLoading, ticketTemplates, currentUser, showToast,
    tickets, setTickets, comments, setAuditLogs, saveToStorage,
    slaRules, holidays, currentRole, auditLogs,
    setEvidence, buFormConfigs, setComments, paymentChannels,
    businessUnitCodes,
  } = useApp();
  const { setActiveTicketId, setActiveTab } = useUi();

  const [customerView, setCustomerView] = useState<'file_complaint' | 'customer_records'>('file_complaint');
  const [newTicket, setNewTicket] = useState<NewTicketForm>(() => {
    if (currentRole === UserRole.CUSTOMER && currentUser?.email) {
      return {
        ...defaultNewTicket,
        customerFirstName: currentUser.firstName || '',
        customerLastName: currentUser.lastName || '',
        customerEmail: currentUser.email,
        customerPhone: currentUser.phone || '',
      };
    }
    return defaultNewTicket;
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [identityErrors, setIdentityErrors] = useState<Record<string, string>>({});
  const [customerQuery, setCustomerQuery] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buFormConfig = useMemo(
    () => getBuFormConfig(buFormConfigs, currentUser?.bu || 'POSSAP'),
    [buFormConfigs, currentUser?.bu],
  );
  const [txValues, setTxValues] = useState<Record<string, FormFieldValue>>({});
  const [txErrors, setTxErrors] = useState<Record<string, string>>({});
  const [pendingRecord, setPendingRecord] = useState<TicketRecord | null>(null);
  const [dupCandidates, setDupCandidates] = useState<DuplicateCandidate[]>([]);
  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successRecord, setSuccessRecord] = useState<TicketRecord | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  const [prevConfig, setPrevConfig] = useState(buFormConfig);
  if (prevConfig !== buFormConfig) {
    setPrevConfig(buFormConfig);
    setTxValues(prev => {
      const seed: Record<string, FormFieldValue> = {};
      for (const f of buFormConfig.fields) seed[f.id] = prev[f.id] ?? '';
      return seed;
    });
  }

  const clearCustomer = () => {
    setNewTicket(prev => ({ ...prev, customerId: undefined, customerFirstName: '', customerLastName: '', customerEmail: '', customerPhone: '' }));
    setCustomerQuery('');
  };

  const handleIdentityChange = (field: string, value: string) => {
    setNewTicket(prev => ({ ...prev, [field]: value, customerId: field !== 'customerId' ? undefined : prev.customerId }));
    setIdentityErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const handleIncidentChange = (field: string, value: string) => {
    setNewTicket(prev => ({ ...prev, [field]: value }));
  };

  const handleTxChange = (id: string, value: FormFieldValue) => {
    setTxValues(prev => ({ ...prev, [id]: value }));
    if (txErrors[id]) setTxErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleDescriptionChange = (value: string) => {
    setNewTicket(prev => ({ ...prev, description: value }));
    setFormErrors(prev => { const n = { ...prev }; delete n.description; return n; });
  };

  const handleFilesAdd = (files: File[]) => {
    setUploadedFiles(prev => [...prev, ...files]);
    showToast(`Added ${files.length} file(s).`, 'success');
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (newTicket.customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newTicket.customerEmail.trim())) {
      errs.customerEmail = 'Enter a valid email address';
    }
    setIdentityErrors(errs);
    if (newTicket.requiresAmount === 'yes' && parseNaira(newTicket.amount) <= 0) errs.amount = 'Valid transaction amount is required';
    if (!newTicket.description.trim()) errs.description = 'Incident description is required';
    for (const f of buFormConfig.fields) {
      if (!f.enabled) continue;
      const err = validateFieldValue(f, txValues[f.id]);
      if (err) errs[`tx.${f.id}`] = err;
    }
    setFormErrors(errs);
    const nextTxErrors: Record<string, string> = {};
    for (const f of buFormConfig.fields) {
      const err = validateFieldValue(f, txValues[f.id]);
      if (err) nextTxErrors[f.id] = err;
    }
    setTxErrors(nextTxErrors);
    return Object.keys(errs).length === 0;
  };

  // Clear draft PII on tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      try { localStorage.removeItem('complaint_draft_v1'); } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const DRAFT_KEY = 'complaint_draft_v1';

  useEffect(() => {
    if (customerView !== 'file_complaint') return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ newTicket, txValues, savedAt: Date.now() }));
        setDraftSavedAt(Date.now());
      } catch { /* silent */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [customerView, newTicket, txValues]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft.newTicket) setNewTicket(draft.newTicket);
        if (draft.txValues) setTxValues(draft.txValues);
        if (draft.savedAt) setDraftSavedAt(draft.savedAt);
      } catch { /* ignore corrupt draft */ }
    });
  }, []);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftSavedAt(null);
  };

  const stepErrorCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    Object.values(identityErrors).forEach(v => { if (v) counts[0] = (counts[0] || 0) + 1; });
    Object.values(txErrors).forEach(v => { if (v) counts[2] = (counts[2] || 0) + 1; });
    if (formErrors.description) counts[3] = (counts[3] || 0) + 1;
    return counts;
  }, [identityErrors, txErrors, formErrors]);

  const handleStepValidate = (stepIndex: number) => {
    if (stepIndex === 0) {
      const errs: Record<string, string> = {};
      if (newTicket.customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newTicket.customerEmail.trim())) {
        errs.customerEmail = 'Enter a valid email address';
      }
      setIdentityErrors(errs);
      return Object.keys(errs).length === 0;
    }
    if (stepIndex === 2) {
      const errs: Record<string, string> = {};
      for (const f of buFormConfig.fields) {
        if (!f.enabled) continue;
        const err = validateFieldValue(f, txValues[f.id]);
        if (err) errs[f.id] = err;
      }
      setTxErrors(errs);
      return Object.keys(errs).length === 0;
    }
    if (stepIndex === 3) {
      const descOk = newTicket.description.trim().length > 0;
      if (!descOk) setFormErrors(prev => ({ ...prev, description: 'Incident description is required' }));
      return descOk;
    }
    return true;
  };

  const buildRecord = (): TicketRecord => {
    const tId = nextTicketId(
      currentUser.bu,
      Object.keys(businessUnitCodes).map((name) => ({ name, code: businessUnitCodes[name] })),
      tickets.map((t) => t.id),
    );
    const deadline = calculateSlaDeadline(new Date(), newTicket.category, newTicket.priority, slaRules, holidays).toISOString();
    const standardIds = ['transactionId', 'amount'];
    const customFields: Record<string, string | number | boolean> = {};
    for (const f of buFormConfig.fields) {
      const v = txValues[f.id];
      if (v === undefined || v === null || v === '') continue;
      if (standardIds.includes(f.id)) continue;
      customFields[f.id] = v as string | number | boolean;
    }
    const txAmount = String(txValues['amount'] ?? '').trim();
    const txId = String(txValues['transactionId'] ?? '').trim();
    const isCustomerRole = currentRole === UserRole.CUSTOMER;
    const staffName = (currentUser.firstName + ' ' + currentUser.lastName).trim();
    const customerFullName = `${newTicket.customerFirstName.trim()} ${newTicket.customerLastName.trim()}`.trim();

    return {
      id: tId,
      customerName: customerFullName || 'Unknown Customer',
      customerEmail: newTicket.customerEmail.trim(),
      customerPhone: newTicket.customerPhone.trim() || undefined,
      customerId: newTicket.customerId,
      businessUnit: currentUser.bu,
      partner: newTicket.partner,
      category: newTicket.category,
      priority: newTicket.priority,
      status: TicketStatus.ASSIGNED,
      amount: txAmount ? parseNaira(txAmount) : 0,
      transactionId: txId || 'TXN_' + Math.floor(Math.random() * 1000000000000),
      description: newTicket.description,
      createdAt: new Date().toISOString(),
      slaDeadline: deadline,
      isEscalated: false,
      escalationCount: 0,
      assignedAgentId: `${newTicket.partner} Payment Partner Team`,
      majorIncidentId: null,
      feedbackScore: null,
      feedbackComment: null,
      watchers: [],
      submittedBy: 'BU_SUPPORT',
      submittedByName: isCustomerRole ? undefined : staffName,
      bankName: newTicket.bankName.trim() || N_A_BANK,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    };
  };

  const uploadEvidence = async (ticketId: string) => {
    if (uploadedFiles.length === 0) return;
    showToast('Uploading evidence...', 'info');
    const compressed = await compressFiles(uploadedFiles);
    const uploaded: FileEvidence[] = [];
    for (const f of compressed) {
      const ev = await syncEvidenceUpload(ticketId, f);
      if (ev) uploaded.push(ev);
    }
    if (uploaded.length > 0) {
      setEvidence(prev => [...uploaded, ...prev]);
      showToast(`${uploaded.length} evidence file(s) uploaded securely.`, 'success');
    }
  };

  const performCreate = async (record: TicketRecord) => {
    const tId = record.id;
    const updatedTickets = [record, ...tickets];
    const newAudit: AuditLog = { id: 'aud-' + Date.now(), timestamp: new Date().toISOString(), ticketId: tId, actor: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole, action: 'CREATED_TICKET', details: `Generated ticket ${tId} for category: ${record.category} under BU: ${record.businessUnit}` };
    const assignedAudit: AuditLog = { id: 'aud-' + Date.now() + '-a', timestamp: new Date().toISOString(), ticketId: tId, actor: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole, action: 'TICKET_ASSIGNED', details: `Ticket ${tId} auto-assigned to ${record.assignedAgentId} on intake.` };
    const updatedAudits = [assignedAudit, newAudit, ...auditLogs];
    setTickets(updatedTickets);
    setAuditLogs(updatedAudits);
    saveToStorage(updatedTickets, comments, updatedAudits);

    let serverConfirmed = false;
    try {
      await syncCreateTicket(record);
      await syncAudit({ ticketId: tId, action: 'CREATED_TICKET', details: newAudit.details });
      await syncAudit({ ticketId: tId, action: 'TICKET_ASSIGNED', details: assignedAudit.details });
      serverConfirmed = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Server sync failed — ticket saved locally only';
      showToast(msg, 'error');
    }

    await uploadEvidence(tId);
    setActiveTicketId(tId);
    setActiveTab('tickets');
    setFormErrors({});
    showToast(`Ticket ${tId} ${serverConfirmed ? 'created and synced' : 'saved locally (server sync failed)'}`, serverConfirmed ? 'success' : 'error');
  };

  const performMerge = async (existing: TicketRecord, incoming: TicketRecord) => {
    const merged = buildDuplicatePayload(existing, incoming);
    const updatedTickets = tickets.map(t => (t.id === existing.id ? merged : t));
    const mergeComment: CommentRecord = { id: 'cmt-' + Date.now(), ticketId: existing.id, author: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole, message: `Appended duplicate complaint from ${incoming.customerName} (new submission ${incoming.id}). Description and evidence merged; status unchanged.`, timestamp: new Date().toISOString(), isInternal: false, seen: false };
    const mergeAudit: AuditLog = { id: 'aud-' + Date.now(), timestamp: new Date().toISOString(), ticketId: existing.id, actor: currentUser.firstName + ' ' + currentUser.lastName, role: currentRole, action: 'MERGED_DUPLICATE', details: `Duplicate submission ${incoming.id} merged into ${existing.id}.` };
    setTickets(updatedTickets);
    setComments(prev => [mergeComment, ...prev]);
    setAuditLogs(prev => [mergeAudit, ...prev]);
    saveToStorage(updatedTickets, [mergeComment, ...comments], [mergeAudit, ...auditLogs]);
    syncTicketUpdate(existing.id, { description: merged.description, amount: merged.amount, transactionId: merged.transactionId, customFields: merged.customFields || {} });
    syncComment(mergeComment);
    syncAudit({ ticketId: existing.id, action: 'MERGED_DUPLICATE', details: mergeAudit.details });
    await uploadEvidence(existing.id);
    setActiveTicketId(existing.id);
    setActiveTab('tickets');
    setFormErrors({});
    showToast(`Merged duplicate into ${existing.id}.`, 'success');
  };

  const handleResolveDuplicate = async (choice: DuplicateChoice, candidate?: DuplicateCandidate) => {
    if (!pendingRecord) return;
    setDupModalOpen(false);
    try {
      if (choice === 'create') {
        await performCreate(pendingRecord);
        setSuccessRecord(pendingRecord);
      } else if (choice === 'merge' && candidate) {
        await performMerge(candidate.ticket, pendingRecord);
        setSuccessRecord(candidate.ticket);
      }
      clearDraft();
    } finally {
      setIsSubmitting(false);
      setPendingRecord(null);
      setDupCandidates([]);
    }
  };

  const handleFormSubmit = async () => {
    if (!validate()) {
      showToast('Please fill in all required fields. Errors are highlighted below.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const record = buildRecord();
      const candidates = detectDuplicates(txValues, buFormConfig, tickets, currentUser.bu);
      if (candidates.length > 0) {
        setPendingRecord(record);
        setDupCandidates(candidates);
        setDupModalOpen(true);
        return;
      }
      await performCreate(record);
      setSuccessRecord(record);
      clearDraft();
    } catch { /* errors surfaced via toasts */ } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <PageContainer maxWidth="full">
        {isLoading ? (
          <div className="space-y-4"><Skeleton variant="card" count={3} /></div>
        ) : (
          <>
            <PageHeader
              title="Complaint Intake"
              subtitle="Log complaints on behalf of customers and look up customer records"
              breadcrumbs={[{ label: 'Home' }, { label: 'Complaints' }]}
            />

            {/* View Toggle */}
            <div className="flex gap-2 mb-6 flex-wrap">
              <Button onClick={() => setCustomerView('file_complaint')} variant={customerView === 'file_complaint' ? 'primary' : 'secondary'} icon={<Plus className="w-3.5 h-3.5" />} className="w-full sm:w-auto">Log Complaint</Button>
              <Button onClick={() => setCustomerView('customer_records')} variant={customerView === 'customer_records' ? 'primary' : 'secondary'} icon={<Ticket className="w-3.5 h-3.5" />} className="w-full sm:w-auto">Customer Records</Button>
            </div>

            {customerView === 'file_complaint' && (
              <div className="bg-surface-elevated rounded-xl p-6 lg:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-light rounded-full flex items-center justify-center text-primary"><Plus className="w-6 h-6" /></div>
                    <div>
                      <h3 className="font-bold text-lg text-text-primary">File a Payment Complaint</h3>
                      <p className="text-xs text-text-muted">Complaint Handling Standard Procedure</p>
                    </div>
                  </div>
                  {ticketTemplates.length > 0 && (
                    <div className="flex flex-col items-end">
                      <Select
                        label="Use Incident Template"
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const tmpl = ticketTemplates.find(t => t.id === val);
                          if (!tmpl) return;
                          setNewTicket(prev => ({ ...prev, category: tmpl.category, priority: tmpl.priority, transactionId: 'TXN_' + Math.floor(Math.random() * 1000000000000), amount: tmpl.amount || '', partner: tmpl.partner, description: tmpl.ticketDescription, terminalId: 'TERM_9042', bankName: N_A_BANK, nipSessionId: '', requiresAmount: tmpl.amount ? 'yes' : 'no' } as NewTicketForm));
                          setTxValues(prev => ({ ...prev, amount: tmpl.amount || '', transactionId: 'TXN_' + Math.floor(Math.random() * 1000000000000), terminalId: 'TERM_9042', nipSessionId: '' }));
                          showToast(`Loaded Template: "${tmpl.name}"`, 'success');
                        }}
                        options={[{ value: '', label: '-- Pre-populate Fields --' }, ...ticketTemplates.map(t => ({ value: t.id, label: t.name }))]}
                      />
                    </div>
                  )}
                </div>

                {draftSavedAt && customerView === 'file_complaint' && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted mb-4">
                    <CheckCircle className="w-3.5 h-3.5 text-success" /> Draft saved locally
                  </div>
                )}

                <SliderForm
                  steps={[
                    {
                      label: 'Customer', title: 'Customer Identity', subtitle: 'Optional — who is the complaint about? Skip this step if unknown.',
                      errorCount: stepErrorCounts[0] || 0,
                      content: (
                        <CustomerIdentityStep
                          customerFirstName={newTicket.customerFirstName}
                          customerLastName={newTicket.customerLastName}
                          customerEmail={newTicket.customerEmail}
                          customerPhone={newTicket.customerPhone}
                          customerId={newTicket.customerId}
                          customerQuery={customerQuery}
                          setCustomerQuery={setCustomerQuery}
                          identityErrors={identityErrors}
                          onChange={handleIdentityChange}
                          onClearCustomer={clearCustomer}
                        />
                      ),
                    },
                    {
                      label: 'Details', title: 'Incident Details', subtitle: 'Select the partner, issue category and bank.',
                      errorCount: stepErrorCounts[1] || 0,
                      content: <IncidentDetailsStep partner={newTicket.partner} category={newTicket.category} bankName={newTicket.bankName} onChange={handleIncidentChange} />,
                    },
                    {
                      label: 'Transaction', title: 'Transaction Information', subtitle: 'Provide transaction details for the payment incident.',
                      errorCount: stepErrorCounts[2] || 0,
                      content: (
                        <TransactionInfoStep
                          buFormConfig={buFormConfig}
                          txValues={txValues}
                          txErrors={txErrors}
                          category={newTicket.category}
                          paymentChannels={paymentChannels}
                          onChange={handleTxChange}
                          onValidation={(errs) => setTxErrors(prev => ({ ...prev, ...errs }))}
                        />
                      ),
                    },
                    {
                      label: 'Submit', title: 'Description & Evidence', subtitle: 'Describe the issue and attach supporting documents.',
                      errorCount: stepErrorCounts[3] || 0,
                      content: (
                        <DescriptionEvidenceStep
                          description={newTicket.description}
                          descriptionError={formErrors.description}
                          uploadedFiles={uploadedFiles}
                          onDescriptionChange={handleDescriptionChange}
                          onFilesAdd={handleFilesAdd}
                          onFileRemove={(i) => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                          fileInputRef={fileInputRef}
                        />
                      ),
                    },
                  ]}
                  onSubmit={handleFormSubmit}
                  onStepValidate={handleStepValidate}
                  submitLabel={isSubmitting ? 'Creating Ticket\u2026' : 'Transmit Complaint to Incident Control Desk'}
                />
              </div>
            )}

            {customerView === 'customer_records' && <CustomerRecordsView />}

            <DuplicateResolutionModal
              open={dupModalOpen}
              candidates={dupCandidates}
              incoming={{
                customerName: `${newTicket.customerFirstName.trim()} ${newTicket.customerLastName.trim()}`.trim() || currentUser.firstName + ' ' + currentUser.lastName,
                category: newTicket.category,
                amount: pendingRecord?.amount || 0,
                evidenceCount: uploadedFiles.length,
              }}
              onResolve={handleResolveDuplicate}
              onCancel={() => { setDupModalOpen(false); setIsSubmitting(false); setPendingRecord(null); setDupCandidates([]); }}
              isSubmitting={isSubmitting}
            />

            <ComplaintSuccessModal
              record={successRecord}
              onClose={() => setSuccessRecord(null)}
              onViewTickets={() => { setSuccessRecord(null); setActiveTab('tickets'); }}
            />
          </>
        )}
      </PageContainer>
    </PageTransition>
  );
}
