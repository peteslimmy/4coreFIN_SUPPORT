import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Upload, Ticket, Clock, CheckCircle, Mail, Search, FileText, X, User } from 'lucide-react';
import { TicketStatus, TicketPriority, UserRole, type TicketRecord, type AuditLog, type FileEvidence, type CommentRecord, type CustomerRecord } from '../types/app';
import { calculateSlaDeadline } from '../lib/slaCalculator';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { syncCreateTicket, syncTicketUpdate, syncEvidenceUpload, syncComment, syncAudit } from '../lib/sync';
import { compressFiles } from '../lib/imageCompression';
import { parseNaira } from '../lib/currencyFormat';
import { getBuFormConfig, validateFieldValue } from '../lib/formConfigs';
import type { FormFieldValue } from '../types/forms';
import { detectDuplicates, buildDuplicatePayload, type DuplicateCandidate } from '../lib/duplicateDetection';
import DynamicFormStep from '../components/forms/DynamicFormStep';
import DuplicateResolutionModal, { type DuplicateChoice } from '../components/forms/DuplicateResolutionModal';
import StatusBadge from '../components/ui/StatusBadge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Textarea from '../components/ui/Textarea';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';
import SliderForm from '../components/ui/SliderForm';
import Modal from '../components/ui/Modal';

interface NewTicketForm {
  category: string; priority: string;
  transactionId: string; amount: string; partner: string;
  description: string; terminalId: string;
  bankName: string; nipSessionId: string;
  requiresAmount: 'yes' | 'no';
  customerName: string; customerEmail: string; customerPhone: string; customerId?: string;
}
const defaultNewTicket: NewTicketForm = {
  category: 'Failed Payment',
  priority: TicketPriority.HIGH,
  transactionId: '',
  amount: '',
  partner: 'Parkway',
  description: '',
  terminalId: '',
  bankName: 'Undefined',
  nipSessionId: '',
  requiresAmount: 'no',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerId: undefined
};

export default function CustomerPortalPage() {
  const {
    isLoading, ticketTemplates, partners, categories, currentUser, showToast,
    tickets, setTickets, comments, setAuditLogs, saveToStorage,
    slaRules, holidays, currentRole, auditLogs,
    setEvidence, buFormConfigs, setComments, paymentChannels, customers
  } = useApp();
  const { setActiveTicketId, setActiveTab } = useUi();

  const [customerView, setCustomerView] = useState<'file_complaint' | 'customer_records'>('file_complaint');
  const [recordQuery, setRecordQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [recordPickerOpen, setRecordPickerOpen] = useState(false);

  const [newTicket, setNewTicket] = useState<NewTicketForm>(() => {
    if (currentRole === UserRole.CUSTOMER && currentUser?.email) {
      return {
        ...defaultNewTicket,
        customerName: (currentUser.firstName + ' ' + currentUser.lastName).trim(),
        customerEmail: currentUser.email,
        customerPhone: currentUser.phone || ''
      };
    }
    return defaultNewTicket;
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [identityErrors, setIdentityErrors] = useState<Record<string, string>>({});
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buFormConfig = useMemo(
    () => getBuFormConfig(buFormConfigs, currentUser?.bu || 'POSSAP'),
    [buFormConfigs, currentUser?.bu]
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

  const customerMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(c => c.email.toLowerCase().includes(q) || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customerQuery, customers]);

  const recordMatches = useMemo(() => {
    const q = recordQuery.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(c => c.email.toLowerCase().includes(q) || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [recordQuery, customers]);

  const selectedCustomerTickets = useMemo(() => {
    if (!selectedCustomer) return [];
    return tickets.filter(t =>
      t.customerEmail.toLowerCase() === selectedCustomer.email.toLowerCase()
    );
  }, [selectedCustomer, tickets]);

  const pickCustomer = (c: CustomerRecord) => {
    setNewTicket(prev => ({
      ...prev,
      customerId: c.id,
      customerName: `${c.firstName} ${c.lastName}`.trim(),
      customerEmail: c.email,
      customerPhone: c.phone || ''
    }));
    setIdentityErrors({});
    setCustomerQuery('');
    setCustomerPickerOpen(false);
  };

  const clearCustomer = () => {
    setNewTicket(prev => ({ ...prev, customerId: undefined, customerName: '', customerEmail: '', customerPhone: '' }));
    setCustomerQuery('');
  };

  const generateTicketId = (bu: string) => {
    const cleanBu = bu.substring(0, 3).toUpperCase();
    const today = new Date();
    const yyyymmdd = today.getFullYear().toString() +
                     (today.getMonth() + 1).toString().padStart(2, '0') +
                     today.getDate().toString().padStart(2, '0');
    const seq = Math.floor(Math.random() * 9000) + 1000;
    return `${cleanBu}-${yyyymmdd}-${seq}`;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!newTicket.customerName.trim()) errs.customerName = 'Customer name is required';
    if (!newTicket.customerEmail.trim()) errs.customerEmail = 'Customer email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newTicket.customerEmail.trim())) errs.customerEmail = 'Enter a valid email address';
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

  const clearError = (field: string) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  // Clear draft PII on tab close for PII safety
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
      } catch {
        // silent — storage may be unavailable
      }
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
      } catch {
        // ignore corrupt draft
      }
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
      if (!newTicket.customerName.trim()) errs.customerName = 'Customer name is required';
      if (!newTicket.customerEmail.trim()) errs.customerEmail = 'Customer email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newTicket.customerEmail.trim())) errs.customerEmail = 'Enter a valid email address';
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
    const tId = generateTicketId(currentUser.bu);
    const deadlineDate = calculateSlaDeadline(
      new Date(),
      newTicket.category,
      newTicket.priority,
      slaRules,
      holidays
    );
    const deadline = deadlineDate.toISOString();

    const standardIds = ['transactionId', 'amount', 'bankName'];
    const customFields: Record<string, string | number | boolean> = {};
    for (const f of buFormConfig.fields) {
      const v = txValues[f.id];
      if (v === undefined || v === null || v === '') continue;
      if (standardIds.includes(f.id)) continue;
      customFields[f.id] = v as string | number | boolean;
    }
    const txAmount = String(txValues['amount'] ?? '').trim();
    const txBank = String(txValues['bankName'] ?? '').trim();
    const txId = String(txValues['transactionId'] ?? '').trim();
    const isCustomerRole = currentRole === UserRole.CUSTOMER;
    const staffName = (currentUser.firstName + ' ' + currentUser.lastName).trim();

    return {
      id: tId,
      customerName: newTicket.customerName.trim(),
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
      submittedBy: isCustomerRole ? 'CUSTOMER' : 'BU_SUPPORT',
      submittedByName: isCustomerRole ? undefined : staffName,
      bankName: txBank || 'Undefined',
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined
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
    const newAudit: AuditLog = {
      id: 'aud-' + Date.now(),
      timestamp: new Date().toISOString(),
      ticketId: tId,
      actor: currentUser.firstName + ' ' + currentUser.lastName,
      role: currentRole,
      action: 'CREATED_TICKET',
      details: `Generated ticket ${tId} for category: ${record.category} under BU: ${record.businessUnit}`
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
    showToast(
      `Ticket ${tId} ${serverConfirmed ? 'created and synced' : 'saved locally (server sync failed)'}`,
      serverConfirmed ? 'success' : 'error'
    );
  };

  const performMerge = async (existing: TicketRecord, incoming: TicketRecord) => {
    const merged = buildDuplicatePayload(existing, incoming);
    const updatedTickets = tickets.map(t => (t.id === existing.id ? merged : t));
    const mergeComment: CommentRecord = {
      id: 'cmt-' + Date.now(),
      ticketId: existing.id,
      author: currentUser.firstName + ' ' + currentUser.lastName,
      role: currentRole,
      message: `Appended duplicate complaint from ${incoming.customerName} (new submission ${incoming.id}). Description and evidence merged; status unchanged.`,
      timestamp: new Date().toISOString(),
      isInternal: false,
      seen: false,
    };
    const mergeAudit: AuditLog = {
      id: 'aud-' + Date.now(),
      timestamp: new Date().toISOString(),
      ticketId: existing.id,
      actor: currentUser.firstName + ' ' + currentUser.lastName,
      role: currentRole,
      action: 'MERGED_DUPLICATE',
      details: `Duplicate submission ${incoming.id} merged into ${existing.id}.`
    };

    setTickets(updatedTickets);
    setComments(prev => [mergeComment, ...prev]);
    setAuditLogs(prev => [mergeAudit, ...prev]);
    saveToStorage(updatedTickets, [mergeComment, ...comments], [mergeAudit, ...auditLogs]);
    syncTicketUpdate(existing.id, {
      description: merged.description,
      amount: merged.amount,
      transactionId: merged.transactionId,
      customFields: merged.customFields || {},
    });
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
    } catch {
      // errors surfaced via toasts inside performCreate
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <PageContainer maxWidth="full">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton variant="card" count={3} />
          </div>
        ) : (
        <>
        <PageHeader
          title="Complaint Intake"
          subtitle="Log complaints on behalf of customers and look up customer records"
          breadcrumbs={[{ label: 'Home' }, { label: 'Complaints' }]}
        />
      {/* View Toggle */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          onClick={() => setCustomerView('file_complaint')}
          variant={customerView === 'file_complaint' ? 'primary' : 'secondary'}
          icon={<Plus className="w-3.5 h-3.5" />}
          className="w-full sm:w-auto"
        >
          Log Complaint
        </Button>
        <Button
          onClick={() => setCustomerView('customer_records')}
          variant={customerView === 'customer_records' ? 'primary' : 'secondary'}
          icon={<Ticket className="w-3.5 h-3.5" />}
          className="w-full sm:w-auto"
        >
          Customer Records
        </Button>
      </div>

      {customerView === 'file_complaint' && (
        <div className="bg-surface-elevated rounded-xl p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-light rounded-full flex items-center justify-center text-primary">
                <Plus className="w-6 h-6" />
              </div>
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
                    setNewTicket(prev => ({
                      ...prev,
                      category: tmpl.category,
                      priority: tmpl.priority,
                      transactionId: 'TXN_' + Math.floor(Math.random() * 1000000000000),
                      amount: tmpl.amount || '',
                      partner: tmpl.partner,
                      description: tmpl.ticketDescription,
                      terminalId: 'TERM_9042',
                      bankName: 'Undefined',
                      nipSessionId: '',
                      requiresAmount: tmpl.amount ? 'yes' : 'no'
                    } as NewTicketForm));
                    setTxValues(prev => ({
                      ...prev,
                      amount: tmpl.amount || '',
                      transactionId: 'TXN_' + Math.floor(Math.random() * 1000000000000),
                      terminalId: 'TERM_9042',
                      bankName: 'Undefined',
                      nipSessionId: '',
                    }));
                    showToast(`Loaded Template: "${tmpl.name}"`, 'success');
                  }}
                  options={[
                    { value: '', label: '-- Pre-populate Fields --' },
                    ...ticketTemplates.map(t => ({ value: t.id, label: t.name }))
                  ]}
                />
              </div>
            )}
          </div>

          {draftSavedAt && customerView === 'file_complaint' && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted mb-4">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              Draft saved locally
            </div>
          )}

          <SliderForm
            steps={[
              {
                label: 'Customer',
                title: 'Customer Identity',
                subtitle: 'Who is the complaint about? Existing customers can be looked up or entered fresh.',
                errorCount: stepErrorCounts[0] || 0,
                content: (
                  <div className="space-y-4">
                    <div className="relative">
                      <Input
                        label="Find Existing Customer"
                        icon={<Search className="w-4 h-4" />}
                        value={customerQuery}
                        onChange={(e) => { setCustomerQuery(e.target.value); setCustomerPickerOpen(true); }}
                        onFocus={() => setCustomerPickerOpen(true)}
                        onBlur={() => setTimeout(() => setCustomerPickerOpen(false), 150)}
                        placeholder="Search by name or email (optional)"
                        helperText={newTicket.customerId ? 'Customer linked to this complaint.' : 'No match? Just type the details below and a customer record is created automatically.'}
                      />
                      {customerPickerOpen && (
                        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface-elevated shadow-lg max-h-56 overflow-y-auto">
                          {customerMatches.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-text-muted">No matching customers</p>
                          ) : (
                            customerMatches.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
                                className="w-full text-left px-3 py-2 hover:bg-surface-hover transition flex items-center justify-between gap-2"
                              >
                                <span className="truncate">
                                  <span className="text-sm font-semibold text-text-primary">{c.firstName} {c.lastName}</span>
                                  <span className="ml-2 text-xs text-text-muted">{c.email}</span>
                                </span>
                                <span className="shrink-0 text-[10px] font-semibold text-primary">{c.totalTickets} ticket{c.totalTickets === 1 ? '' : 's'}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    {newTicket.customerId && (
                      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                        <p className="text-xs text-text-secondary">Linked to existing customer <span className="font-semibold text-text-primary">{newTicket.customerEmail}</span></p>
                        <button type="button" onClick={clearCustomer} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-error transition focus-ring">
                          <X className="w-3.5 h-3.5" /> Unlink
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Customer Name"
                        required
                        value={newTicket.customerName}
                        onChange={(e) => { setNewTicket(prev => ({ ...prev, customerName: e.target.value, customerId: undefined })); setIdentityErrors(prev => { const n = { ...prev }; delete n.customerName; return n; }); }}
                        placeholder="e.g. Chinedu Okonkwo"
                        error={identityErrors.customerName}
                      />
                      <Input
                        label="Customer Email"
                        type="email"
                        required
                        value={newTicket.customerEmail}
                        onChange={(e) => { setNewTicket(prev => ({ ...prev, customerEmail: e.target.value, customerId: undefined })); setIdentityErrors(prev => { const n = { ...prev }; delete n.customerEmail; return n; }); }}
                        placeholder="customer@example.com"
                        error={identityErrors.customerEmail}
                      />
                      <Input
                        label="Customer Phone"
                        value={newTicket.customerPhone}
                        onChange={(e) => setNewTicket(prev => ({ ...prev, customerPhone: e.target.value, customerId: undefined }))}
                        placeholder="+234..."
                        helperText="Optional"
                      />
                    </div>
                  </div>
                ),
              },
              {
                label: 'Details',
                title: 'Incident Details',
                subtitle: 'Select the partner and issue category.',
                errorCount: stepErrorCounts[1] || 0,
                content: (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Mapped Business Unit (Auto-detected)" value={currentUser.bu} disabled />
                    <Select label="Payment Partner" value={newTicket.partner} onChange={(e) => setNewTicket(prev => ({ ...prev, partner: e.target.value }))} options={partners.map(p => ({ value: p, label: p }))} />
                    <Select label="Issue Category" value={newTicket.category} onChange={(e) => setNewTicket(prev => ({ ...prev, category: e.target.value }))} options={categories.map(c => ({ value: c.name, label: c.name }))} />
                  </div>
                ),
              },
              {
                label: 'Transaction',
                title: 'Transaction Information',
                subtitle: 'Provide transaction details for the payment incident.',
                errorCount: stepErrorCounts[2] || 0,
                content: (
                  <div className="space-y-4">
                    <DynamicFormStep
                      config={buFormConfig}
                      values={txValues}
                      errors={txErrors}
                      context={{ category: newTicket.category }}
                      paymentChannels={paymentChannels}
                      onChange={(id, value) => {
                        setTxValues(prev => ({ ...prev, [id]: value }));
                        if (txErrors[id]) {
                          setTxErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
                        }
                      }}
                      onValidation={(errs) => {
                        setTxErrors(prev => ({ ...prev, ...errs }));
                      }}
                    />
                    {Object.keys(txErrors).length > 0 && (
                      <div role="alert" className="mt-2 rounded-md bg-error/10 border border-error/20 px-3 py-2 text-xs text-error">
                        <span className="font-medium">Please correct the highlighted transaction fields:</span>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {Object.entries(txErrors).filter(([, v]) => v).map(([k, v]) => {
                            const msg = v as string;
                            return <li key={k}>{msg || k + ' is required'}</li>;
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                label: 'Submit',
                title: 'Description & Evidence',
                subtitle: 'Describe the issue and attach supporting documents.',
                errorCount: stepErrorCounts[3] || 0,
                content: (
                  <div className="space-y-4">
                    <Textarea label="Incident Description" value={newTicket.description} onChange={(e) => { setNewTicket(prev => ({ ...prev, description: e.target.value })); clearError('description'); }} rows={4} placeholder="Please provide explicit details of failed checkout, terminal responses, errors..." required error={formErrors.description} />
                    <div className="bg-surface p-4 rounded-lg border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Upload className="w-5 h-5 text-text-muted" />
                          <span className="font-semibold text-text-secondary">Secure Evidence Upload (PDF, CSV, Images)</span>
                        </div>
                        <Button type="button" onClick={() => fileInputRef.current?.click()} variant="secondary" size="sm">{uploadedFiles.length > 0 ? 'Add Another File' : 'Select Files'}</Button>
                        <input ref={fileInputRef} type="file" multiple accept=".pdf,.csv,.png,.jpg,.jpeg,.xlsx" className="hidden" onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const fileList = e.target.files;
                          if (!fileList) return;
                          const files: File[] = Array.from(fileList);
                          setUploadedFiles(prev => [...prev, ...files]);
                          showToast(`Added ${files.length} file(s).`, 'success');
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }} />
                      </div>
                      {uploadedFiles.length > 0 && (
                        <div className="space-y-1.5">
                          {uploadedFiles.map((f, i) => (
                            <div key={i} className="flex items-center justify-between bg-surface border border-border rounded px-3 py-1.5 text-xs">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                                <span className="truncate font-medium text-text-primary">{f.name}</span>
                                <span className="text-[10px] text-text-muted shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
                              </div>
                              <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-text-muted hover:text-error transition cursor-pointer">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
            onSubmit={handleFormSubmit}
            onStepValidate={handleStepValidate}
            submitLabel={isSubmitting ? 'Creating Ticket\u2026' : 'Transmit Complaint to Incident Control Desk'}
          />
        </div>
      )}

      {customerView === 'customer_records' && (
        <div className="space-y-6">
          <div className="bg-surface-elevated rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-bold text-base text-text-primary">Look Up Customer Record</h3>
                <p className="text-xs text-text-muted">Search by email or name to view a customer's profile and complaint history.</p>
              </div>
            </div>
            <div className="relative">
              <Input
                icon={<Search className="w-4 h-4" />}
                value={recordQuery}
                onChange={(e) => { setRecordQuery(e.target.value); setRecordPickerOpen(true); }}
                onFocus={() => setRecordPickerOpen(true)}
                onBlur={() => setTimeout(() => setRecordPickerOpen(false), 150)}
                placeholder="customer@example.com or name..."
              />
              {recordPickerOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface-elevated shadow-lg max-h-56 overflow-y-auto">
                  {recordMatches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-text-muted">No matching customers</p>
                  ) : (
                    recordMatches.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setSelectedCustomer(c); setRecordQuery(`${c.firstName} ${c.lastName}`.trim()); setRecordPickerOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-surface-hover transition flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          <span className="text-sm font-semibold text-text-primary">{c.firstName} {c.lastName}</span>
                          <span className="ml-2 text-xs text-text-muted">{c.email}</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold text-primary">{c.totalTickets} ticket{c.totalTickets === 1 ? '' : 's'}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {selectedCustomer && (
            <div className="space-y-4">
              <div className="bg-surface-elevated rounded-xl shadow-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-text-primary">{selectedCustomer.firstName} {selectedCustomer.lastName}</h4>
                      <p className="text-xs text-text-muted">{selectedCustomer.email}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => { setSelectedCustomer(null); setRecordQuery(''); }}
                    variant="ghost"
                    size="sm"
                  >
                    Change
                  </Button>
                </div>
                <div className="flex items-center gap-6 mt-3 pt-3 border-t border-border text-xs text-text-muted">
                  <span>Business Unit: <strong className="text-text-primary">{selectedCustomer.businessUnit}</strong></span>
                  <span>Total Tickets: <strong className="text-text-primary">{selectedCustomer.totalTickets}</strong></span>
                  <span>Since: <strong className="text-text-primary">{new Date(selectedCustomer.createdAt).toLocaleDateString()}</strong></span>
                </div>
              </div>

              <div className="space-y-4">
                {selectedCustomerTickets.length === 0 ? (
                  <EmptyState icon={<Ticket className="w-12 h-12" />} title="No tickets found" message="This customer has no complaints on record yet" />
                ) : (
                  selectedCustomerTickets.map(ticket => (
                    <div key={ticket.id} className="bg-surface-elevated rounded-xl shadow-card p-5 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-text-primary text-sm">{ticket.id}</h4>
                          <p className="text-caption text-text-muted mt-0.5">{ticket.category}</p>
                        </div>
                        <StatusBadge status={ticket.status} size="sm" label={ticket.status.replace(/_/g, ' ')} />
                      </div>
                      <p className="text-xs text-text-muted line-clamp-2">{ticket.description}</p>
                      <div className="flex items-center gap-4 text-[11px] text-text-muted font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {ticket.partner}
                        </span>
                        {ticket.submittedByName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            Logged by {ticket.submittedByName}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
      <DuplicateResolutionModal
        open={dupModalOpen}
        candidates={dupCandidates}
        incoming={{
          customerName: newTicket.customerName.trim() || currentUser.firstName + ' ' + currentUser.lastName,
          category: newTicket.category,
          amount: pendingRecord?.amount || 0,
          evidenceCount: uploadedFiles.length,
        }}
        onResolve={handleResolveDuplicate}
        onCancel={() => { setDupModalOpen(false); setIsSubmitting(false); setPendingRecord(null); setDupCandidates([]); }}
        isSubmitting={isSubmitting}
      />
      {successRecord && (
        <Modal
          open={!!successRecord}
          onClose={() => { setSuccessRecord(null); setActiveTab('tickets'); }}
          title="Complaint Submitted Successfully"
          size="md"
          footer={
            <div className="flex justify-between gap-3 w-full flex-wrap">
              <button
                onClick={() => { setSuccessRecord(null); setActiveTab('tickets'); }}
                className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface rounded-lg transition-all duration-200 focus-ring"
              >
                View in Ticket Workspace
              </button>
              <button
                onClick={() => setSuccessRecord(null)}
                className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-lg transition-all duration-200 focus-ring"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">Your complaint has been logged and routed to the relevant team.</p>
            <div className="bg-surface-elevated border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-muted">Ticket ID</span>
                <span className="font-mono font-bold text-text-primary">{successRecord.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">SLA Deadline</span>
                <span className="font-semibold text-text-primary">{new Date(successRecord.slaDeadline).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Status</span>
                <span className="font-semibold text-text-primary">{successRecord.status}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
      </PageContainer>
    </PageTransition>
  );
}
