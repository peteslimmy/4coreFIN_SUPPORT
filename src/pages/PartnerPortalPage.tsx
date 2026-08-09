import { useState, useMemo, useRef } from 'react';
import { type FormEvent, type ChangeEvent } from 'react';
import { Plus, Upload, Ticket, Clock, CheckCircle, Star, ThumbsUp, FileText, X } from 'lucide-react';
import { TicketStatus, TicketPriority, type TicketRecord, type AuditLog, type FileEvidence, type CommentRecord } from '../types/app';
import { calculateSlaDeadline } from '../lib/slaCalculator';
import { useApp } from '../context/AppContext';
import { syncCreateTicket, syncTicketPatch, syncEvidenceUpload, syncComment, syncAudit, syncFeedback } from '../lib/sync';
import { compressFiles } from '../lib/imageCompression';
import { parseNaira } from '../lib/currencyFormat';
import { getBuFormConfig, validateFieldValue } from '../lib/formConfigs';
import type { FormFieldValue } from '../types/forms';
import { detectDuplicates, buildDuplicatePayload, type DuplicateCandidate } from '../lib/duplicateDetection';
import DynamicFormStep from '../components/forms/DynamicFormStep';
import DuplicateResolutionModal, { type DuplicateChoice } from '../components/forms/DuplicateResolutionModal';
import Badge from '../components/ui/Badge';
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

interface NewTicketForm {
  category: string; priority: string;
  transactionId: string; amount: string; provider: string;
  description: string; terminalId: string;
  bankName: string; nipSessionId: string;
  requiresAmount: 'yes' | 'no';
}

const defaultNewTicket: NewTicketForm = {
  category: 'Failed Payment',
  priority: TicketPriority.HIGH,
  transactionId: '',
  amount: '',
  provider: 'Parkway',
  description: '',
  terminalId: '',
  bankName: 'Undefined',
  nipSessionId: '',
  requiresAmount: 'no'
};

export default function PartnerPortalPage() {
  const {
    isLoading, ticketTemplates, providers, categories, currentUser, showToast,
    tickets, setTickets, comments, setAuditLogs, saveToStorage,
    setActiveTicketId, setActiveTab, slaRules, holidays, currentRole, auditLogs,
    setEvidence, evidence, buFormConfigs, setComments, paymentChannels
  } = useApp();

  const [activeView, setActiveView] = useState<'file_complaint' | 'my_tickets'>('file_complaint');
  const [surveyInput, setSurveyInput] = useState<Record<string, { score: number; comment: string }>>({});

  const [newTicket, setNewTicket] = useState<NewTicketForm>(defaultNewTicket);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
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

  const [prevConfig, setPrevConfig] = useState(buFormConfig);
  if (prevConfig !== buFormConfig) {
    setPrevConfig(buFormConfig);
    setTxValues(prev => {
      const seed: Record<string, FormFieldValue> = {};
      for (const f of buFormConfig.fields) seed[f.id] = prev[f.id] ?? '';
      return seed;
    });
  }

  // Partners see only their own submitted tickets
  const partnerTickets = useMemo(() => {
    return tickets.filter(t =>
      t.submittedBy === 'PARTNER' &&
      (t.customerEmail.toLowerCase() === currentUser.email.toLowerCase() ||
       t.customerName.toLowerCase() === (currentUser.firstName + ' ' + currentUser.lastName).toLowerCase())
    );
  }, [tickets, currentUser]);

  const handleSubmitSurvey = (ticketId: string) => {
    const survey = surveyInput[ticketId];
    if (!survey || survey.score === 0) {
      showToast('Please select a rating score.', 'error');
      return;
    }
    const updated = tickets.map(t => {
      if (t.id === ticketId) {
        return { ...t, feedbackScore: survey.score, feedbackComment: survey.comment };
      }
      return t;
    });
    setTickets(updated);
    saveToStorage(updated);
    syncFeedback(ticketId, { feedbackScore: survey.score, feedbackComment: survey.comment });
    showToast('Thank you for your feedback!', 'success');
    setSurveyInput(prev => { const next = { ...prev }; delete next[ticketId]; return next; });
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

  const buildRecord = (): TicketRecord => {
    const tId = generateTicketId(currentUser.bu);
    const deadline = calculateSlaDeadline(new Date(), newTicket.category, newTicket.priority, slaRules, holidays).toISOString();

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

    return {
      id: tId,
      customerName: currentUser.firstName + ' ' + currentUser.lastName,
      customerEmail: currentUser.email,
      businessUnit: currentUser.bu,
      provider: newTicket.provider,
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
      assignedAgentId: `${newTicket.provider} Provider Team`,
      majorIncidentId: null,
      feedbackScore: null,
      feedbackComment: null,
      watchers: [],
      submittedBy: 'PARTNER',
      submittedByName: currentUser.firstName + ' ' + currentUser.lastName,
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
      details: `Partner ${currentUser.firstName + ' ' + currentUser.lastName} filed ticket ${tId} for category: ${record.category} under BU: ${record.businessUnit}`
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
    syncCreateTicket(record);
    syncAudit({ ticketId: tId, action: 'CREATED_TICKET', details: newAudit.details });
    syncAudit({ ticketId: tId, action: 'TICKET_ASSIGNED', details: assignedAudit.details });

    await uploadEvidence(tId);

    setActiveTicketId(tId);
    setActiveTab('tickets');
    setFormErrors({});
    showToast(`Ticket ${tId} submitted successfully under ${record.businessUnit}.`, 'success');
    setNewTicket(defaultNewTicket);
    setUploadedFiles([]);
    setTxValues({});
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
    syncTicketPatch(existing.id, {
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
    setNewTicket(defaultNewTicket);
    setUploadedFiles([]);
    setTxValues({});
  };

  const handleResolveDuplicate = (choice: DuplicateChoice, candidate?: DuplicateCandidate) => {
    if (!pendingRecord) return;
    setDupModalOpen(false);
    if (choice === 'create') {
      void performCreate(pendingRecord);
    } else if (choice === 'merge' && candidate) {
      void performMerge(candidate.ticket, pendingRecord);
    }
    setPendingRecord(null);
    setDupCandidates([]);
  };

   const handleCreateTicket = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!validate()) {
      showToast('Please fill in all required fields. Errors are highlighted below.', 'error');
      return;
    }

    const record = buildRecord();
    const candidates = detectDuplicates(txValues, buFormConfig, tickets, currentUser.bu);

    if (candidates.length > 0) {
      setPendingRecord(record);
      setDupCandidates(candidates);
      setDupModalOpen(true);
      return;
    }

    await performCreate(record);
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
          title="Partner Complaint Portal"
          subtitle={`Submit and track payment complaints - Mapped to ${currentUser.bu}`}
          breadcrumbs={[{ label: 'Home' }, { label: 'Partner Portal' }]}
        />
      {/* View Toggle */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          onClick={() => setActiveView('file_complaint')}
          variant={activeView === 'file_complaint' ? 'primary' : 'secondary'}
          icon={<Plus className="w-3.5 h-3.5" />}
          className="w-full sm:w-auto"
        >
          Submit Complaint
        </Button>
        <Button
          onClick={() => setActiveView('my_tickets')}
          variant={activeView === 'my_tickets' ? 'primary' : 'secondary'}
          icon={<Ticket className="w-3.5 h-3.5" />}
          className="w-full sm:w-auto"
        >
          My Tickets ({partnerTickets.length})
        </Button>
      </div>

      {activeView === 'file_complaint' && (
        <div className="bg-surface-elevated rounded-xl p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-light rounded-full flex items-center justify-center text-primary">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-heading text-text-primary">Submit a Payment Complaint</h3>
                <p className="text-caption text-text-muted">Your complaint will be filed under {currentUser.bu}</p>
              </div>
            </div>
            {ticketTemplates.length > 0 && (
              <div className="flex flex-col items-end">
                <Select
                  label="Use Template"
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const tmpl = ticketTemplates.find(t => t.id === val);
                    if (!tmpl) return;
                    setNewTicket({
                      category: tmpl.category,
                      priority: tmpl.priority,
                      transactionId: 'TXN_' + Math.floor(Math.random() * 1000000000000),
                      amount: tmpl.amount || '',
                      provider: tmpl.provider,
                      description: tmpl.ticketDescription,
                      terminalId: 'TERM_9042',
                      bankName: 'Undefined',
                      nipSessionId: '',
                      requiresAmount: tmpl.amount ? 'yes' : 'no'
                    } as NewTicketForm);
                    setTxValues(prev => ({
                      ...prev,
                      amount: tmpl.amount || '',
                      transactionId: 'TXN_' + Math.floor(Math.random() * 1000000000000),
                      terminalId: 'TERM_9042',
                      bankName: 'Undefined',
                      nipSessionId: '',
                    }));
                    showToast(`Loaded template: "${tmpl.name}"`, 'success');
                  }}
                  options={[
                    { value: '', label: '-- Pre-populate Fields --' },
                    ...ticketTemplates.map(t => ({ value: t.id, label: t.name }))
                  ]}
                />
              </div>
            )}
          </div>

          <SliderForm
            steps={[
              {
                label: 'Details',
                title: 'Incident Details',
                subtitle: 'Select the provider and issue category for this complaint.',
                content: (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Your Business Unit (Auto-mapped)" value={currentUser.bu} disabled />
                    <Select label="Payment Provider" value={newTicket.provider} onChange={(e) => setNewTicket(prev => ({ ...prev, provider: e.target.value }))} options={providers.map(p => ({ value: p, label: p }))} />
                    <Select label="Issue Category" value={newTicket.category} onChange={(e) => setNewTicket(prev => ({ ...prev, category: e.target.value }))} options={categories.map(c => ({ value: c.name, label: c.name }))} />
                  </div>
                ),
              },
              {
                label: 'Transaction',
                title: 'Transaction Information',
                subtitle: 'Provide transaction details for the payment incident.',
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
                content: (
                  <div className="space-y-4">
                    <Textarea label="Incident Description" value={newTicket.description} onChange={(e) => { setNewTicket(prev => ({ ...prev, description: e.target.value })); clearError('description'); }} rows={4} placeholder="Describe the payment issue in detail..." required error={formErrors.description} />
                     <div className="bg-surface p-4 rounded-lg border border-border">
                       <div className="flex items-center justify-between mb-3">
                         <div className="flex items-center gap-2">
                           <Upload className="w-5 h-5 text-text-muted" />
                           <span className="font-semibold text-text-secondary">Evidence Upload (PDF, CSV, Images)</span>
                         </div>
                         <Button type="button" onClick={() => fileInputRef.current?.click()} variant="secondary" size="sm">{uploadedFiles.length > 0 ? 'Add Another File' : 'Select Files'}</Button>
                        <input ref={fileInputRef} type="file" multiple accept=".pdf,.csv,.png,.jpg,.jpeg,.xlsx" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => {
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
                             <div key={i} className="flex items-center justify-between bg-surface border border-border rounded px-3 py-1.5 text-caption">
                               <div className="flex items-center gap-2 overflow-hidden">
                                 <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                                 <span className="truncate font-medium text-text-secondary">{f.name}</span>
                                 <span className="text-caption text-text-muted shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
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
            onSubmit={() => handleCreateTicket()}
            submitLabel="Submit Complaint"
          />
        </div>
      )}

      {activeView === 'my_tickets' && (
        <div className="space-y-4">
          {partnerTickets.length === 0 ? (
           <EmptyState icon={<Ticket className="w-12 h-12" />} title="No complaints submitted yet" message="Submit your first complaint using the form above" />
          ) : (
             partnerTickets.map(ticket => {
               const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
                 RECEIPT: 'info',
                 ASSIGNED: 'warning',
                 INVESTIGATE: 'info',
                 RESOLVED: 'success',
                 CLOSED: 'neutral'
               };
               return (
                 <div key={ticket.id} className="bg-surface-elevated rounded-xl p-5 space-y-3">
                   <div className="flex items-start justify-between gap-4">
                     <div>
                       <h4 className="font-bold text-text-primary text-sm">{ticket.id}</h4>
                        <p className="text-caption text-text-muted mt-0.5">{ticket.category}</p>
                     </div>
                     <Badge variant={statusVariant[ticket.status] || 'neutral'}>
                       {ticket.status.replace(/_/g, ' ')}
                     </Badge>
                   </div>
                   <p className="text-base text-text-secondary line-clamp-2">{ticket.description}</p>
                   <div className="flex items-center gap-4 text-caption text-text-muted font-medium">
                     <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(ticket.createdAt).toLocaleDateString()}</span>
                     <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />{ticket.provider}</span>
                      <span className="font-semibold text-text-secondary">{ticket.amount ? 'N' + ticket.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Undefined'}</span>
                   </div>

                   {(() => {
                     const ticketEvs = evidence.filter(e => e.ticketId === ticket.id);
                     if (ticketEvs.length === 0) return null;
                     return (
                       <div className="flex items-center gap-2 flex-wrap pt-1">
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

                   {ticket.status === TicketStatus.CLOSED && !ticket.feedbackScore && (
                     <div className="bg-surface border border-border rounded-lg p-4 mt-2">
                       <h5 className="text-caption font-bold text-text-primary flex items-center gap-1.5 mb-3"><Star className="w-4 h-4 text-warning" />Rate Your Experience</h5>
                       <div className="flex gap-1 mb-3">
                         {[1, 2, 3, 4, 5].map(star => (
                           <button key={star} onClick={() => setSurveyInput(prev => ({ ...prev, [ticket.id]: { ...prev[ticket.id] || { score: 0, comment: '' }, score: star } }))} className={`p-1.5 rounded transition cursor-pointer ${(surveyInput[ticket.id]?.score || 0) >= star ? 'text-warning' : 'text-border hover:text-warning-dark'}`}>
                             <Star className="w-5 h-5 fill-current" />
                           </button>
                         ))}
                       </div>
                       <Textarea placeholder="Share your feedback (optional)..." value={surveyInput[ticket.id]?.comment || ''} onChange={(e) => setSurveyInput(prev => ({ ...prev, [ticket.id]: { ...prev[ticket.id] || { score: 0, comment: '' }, comment: e.target.value } }))} rows={2} className="mb-3" />
                       <Button onClick={() => handleSubmitSurvey(ticket.id)} size="sm" icon={<ThumbsUp className="w-3.5 h-3.5" />}>Submit Feedback</Button>
                     </div>
                   )}

                   {ticket.feedbackScore && (
                     <div className="flex items-center gap-2 text-caption text-text-muted">
                       <Star className="w-4 h-4 text-warning fill-current" />
                       <span className="font-bold">Your rating: {ticket.feedbackScore}/5</span>
                       {ticket.feedbackComment && <span className="text-text-muted">- "{ticket.feedbackComment}"</span>}
                     </div>
                   )}
                 </div>
               );
             })
          )}
        </div>
      )}
      </>
      )}
      <DuplicateResolutionModal
        open={dupModalOpen}
        candidates={dupCandidates}
        incoming={{
          customerName: currentUser.firstName + ' ' + currentUser.lastName,
          category: newTicket.category,
          amount: pendingRecord?.amount || 0,
          evidenceCount: uploadedFiles.length,
        }}
        onResolve={handleResolveDuplicate}
        onCancel={() => { setDupModalOpen(false); setPendingRecord(null); setDupCandidates([]); }}
      />
      </PageContainer>
    </PageTransition>
  );
}
