import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import SliderForm from '../../components/ui/SliderForm';
import { TicketPriority, type CustomerRecord } from '../../types/app';
import { useApp } from '../../context/AppContext';
import { NIGERIAN_BANK_OPTIONS } from '../../lib/formConfigs';

export interface NewTicketFormState {
  customerFirstName: string; customerLastName: string;
  customerEmail: string; customerPhone: string; customerId?: string;
  partner: string; category: string; priority: TicketPriority; bankName: string;
  amount: string; transactionId: string; description: string;
}

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: NewTicketFormState;
  setForm: (updater: (prev: NewTicketFormState) => NewTicketFormState) => void;
  errors: Record<string, string>;
  setErrors: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onSubmit: () => void;
}

export default function NewTicketModal({ isOpen, onClose, form, setForm, errors, setErrors, onSubmit }: NewTicketModalProps) {
  const { partners, categories, customers } = useApp();
  const [customerQuery, setCustomerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const matches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(c => c.email.toLowerCase().includes(q) || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customerQuery, customers]);

  const pickCustomer = (c: CustomerRecord) => {
    setForm(prev => ({
      ...prev,
      customerId: c.id,
      customerFirstName: c.firstName || '',
      customerLastName: c.lastName || '',
      customerEmail: c.email,
      customerPhone: c.phone || '',
    }));
    setCustomerQuery('');
    setPickerOpen(false);
  };

  const clearCustomer = () => {
    setForm(prev => ({ ...prev, customerId: undefined, customerFirstName: '', customerLastName: '', customerEmail: '', customerPhone: '' }));
    setCustomerQuery('');
  };

  const customerFullName = `${form.customerFirstName} ${form.customerLastName}`.trim();

  const handleCustomerNameChange = (value: string) => {
    const trimmed = value.trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? '';
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
    setForm(prev => ({ ...prev, customerFirstName: firstName, customerLastName: lastName, customerId: undefined }));
  };

  const clearError = (field: string) => setErrors(prev => ({ ...prev, [field]: '' }));

  /* Per-step validation — gates Next until required fields are filled.
     Customer phase is optional; Issue Category is the only hard gate before details. */
  const validateStep = (stepIndex: number): boolean => {
    const errs: Record<string, string> = {};
    if (stepIndex === 1 && !form.category) errs.category = 'Issue category is required.';
    if (stepIndex === 2 && !form.description.trim()) errs.description = 'Description is required.';
    if (Object.keys(errs).length > 0) {
      setErrors(prev => ({ ...prev, ...errs }));
      return false;
    }
    return true;
  };

  const stepErrorCounts = [
    errors.customerName ? 1 : 0,
    errors.category ? 1 : 0,
    errors.description ? 1 : 0,
  ];

  return (
    <Modal open={isOpen} onClose={onClose} title="Create New Ticket" size="lg">
      <SliderForm
        steps={[
          {
            label: 'Ticket',
            title: 'Create New Ticket',
            subtitle: 'Capture the complaint details so it routes correctly.',
            content: (
              <div className="space-y-4">
                <div className="relative">
                  <Input
                    label="Find Existing Customer"
                    icon={<Search className="w-4 h-4" />}
                    value={customerQuery}
                    onChange={(e) => { setCustomerQuery(e.target.value); setPickerOpen(true); }}
                    onFocus={() => setPickerOpen(true)}
                    onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                    placeholder="Search by name or email (optional)"
                    helperText={form.customerId ? 'Customer linked to this ticket.' : 'No match? Just type the details below and a customer record is created automatically.'}
                  />
                  {pickerOpen && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface-elevated shadow-lg max-h-56 overflow-y-auto">
                      {matches.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-text-muted">No matching customers</p>
                      ) : (
                        matches.map(c => (
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

                <Input
                  label="Customer Name"
                  value={customerFullName}
                  onChange={(e) => handleCustomerNameChange(e.target.value)}
                  placeholder="e.g. John Doe"
                  helperText="Required for new customer records"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Customer First Name"
                    value={form.customerFirstName}
                    onChange={(e) => { setForm(prev => ({ ...prev, customerFirstName: e.target.value, customerId: undefined })); }}
                    placeholder="e.g. John"
                    helperText="Optional"
                  />
                  <Input
                    label="Customer Last Name"
                    value={form.customerLastName}
                    onChange={(e) => { setForm(prev => ({ ...prev, customerLastName: e.target.value, customerId: undefined })); }}
                    placeholder="e.g. Doe"
                    helperText="Optional"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Customer Email"
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => { setForm(prev => ({ ...prev, customerEmail: e.target.value, customerId: undefined })); setCustomerQuery(''); }}
                    placeholder="customer@example.com"
                    helperText="Optional"
                  />
                  <Input
                    label="Phone"
                    value={form.customerPhone}
                    onChange={(e) => setForm(prev => ({ ...prev, customerPhone: e.target.value, customerId: undefined }))}
                    placeholder="+234..."
                    helperText="Optional"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Partner"
                    value={form.partner}
                    onChange={(e) => setForm(prev => ({ ...prev, partner: e.target.value }))}
                    options={partners.map(p => ({ value: p, label: p }))}
                    placeholder="Select partner"
                  />
                  <Select
                    label="Issue Category"
                    required
                    value={form.category}
                    onChange={(e) => { setForm(prev => ({ ...prev, category: e.target.value })); clearError('category'); }}
                    options={categories.map(c => ({ value: c.name, label: c.name }))}
                    placeholder="Select category"
                    error={errors.category}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Priority"
                    value={form.priority}
                    onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value as TicketPriority }))}
                    options={Object.values(TicketPriority).map(p => ({ value: p, label: p }))}
                  />
                  <Input
                    label="Amount (NGN)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>

                <Input
                  label="Transaction ID"
                  value={form.transactionId}
                  onChange={(e) => setForm(prev => ({ ...prev, transactionId: e.target.value }))}
                  placeholder="TXN_..."
                />

                <Select
                  label="Bank"
                  value={form.bankName}
                  onChange={(e) => setForm(prev => ({ ...prev, bankName: e.target.value }))}
                  options={NIGERIAN_BANK_OPTIONS}
                  helperText="Choose N/A if no bank is involved, or BANK NOT LISTED if yours is missing."
                />

                <Textarea
                  label="Description"
                  required
                  value={form.description}
                  onChange={(e) => { setForm(prev => ({ ...prev, description: e.target.value })); clearError('description'); }}
                  rows={6}
                  placeholder="Describe the issue in detail..."
                  error={errors.description}
                />

                {form.customerId && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                    <p className="text-xs text-text-secondary">Linked to existing customer <span className="font-semibold text-text-primary">{form.customerEmail}</span></p>
                    <button type="button" onClick={clearCustomer} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-error transition focus-ring">
                      <X className="w-3.5 h-3.5" /> Unlink
                    </button>
                  </div>
                )}
              </div>
            )
          }
        ]}
        onSubmit={() => onSubmit()}
        submitLabel="Create Ticket"
      />
    </Modal>
  );
}
