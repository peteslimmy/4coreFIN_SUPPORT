import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';

import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import { TicketPriority, type CustomerRecord } from '../../types/app';
import { useApp } from '../../context/AppContext';

export interface NewTicketFormState {
  customerName: string; customerEmail: string; customerPhone: string; customerId?: string;
  provider: string; category: string; priority: TicketPriority;
  amount: string; transactionId: string; description: string;
}

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: NewTicketFormState;
  setForm: (updater: (prev: NewTicketFormState) => NewTicketFormState) => void;
  errors: Record<string, string>;
  setErrors: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function NewTicketModal({ isOpen, onClose, form, setForm, errors, setErrors, onSubmit }: NewTicketModalProps) {
  const { providers, categories, customers } = useApp();
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
      customerName: `${c.firstName} ${c.lastName}`.trim(),
      customerEmail: c.email,
      customerPhone: c.phone || '',
    }));
    setCustomerQuery('');
    setPickerOpen(false);
  };

  const clearCustomer = () => {
    setForm(prev => ({ ...prev, customerId: undefined, customerName: '', customerEmail: '', customerPhone: '' }));
    setCustomerQuery('');
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Create New Ticket">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="relative">
          <Input
            label="Find Customer"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Customer Name"
            required
            value={form.customerName}
            onChange={(e) => { setForm(prev => ({ ...prev, customerName: e.target.value })); setErrors(prev => ({ ...prev, customerName: '' })); }}
            placeholder="e.g. John Doe"
            error={errors.customerName}
          />
          <Input
            label="Customer Email"
            type="email"
            value={form.customerEmail}
            onChange={(e) => { setForm(prev => ({ ...prev, customerEmail: e.target.value, customerId: undefined })); setCustomerQuery(''); }}
            placeholder="customer@example.com"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Phone"
            value={form.customerPhone}
            onChange={(e) => setForm(prev => ({ ...prev, customerPhone: e.target.value }))}
            placeholder="+234..."
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Provider"
            value={form.provider}
            onChange={(e) => setForm(prev => ({ ...prev, provider: e.target.value }))}
            options={providers.map(p => ({ value: p, label: p }))}
            placeholder="Select provider"
          />
          <Select
            label="Issue Category"
            required
            value={form.category}
            onChange={(e) => { setForm(prev => ({ ...prev, category: e.target.value })); setErrors(prev => ({ ...prev, category: '' })); }}
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
            label="Transaction ID"
            value={form.transactionId}
            onChange={(e) => setForm(prev => ({ ...prev, transactionId: e.target.value }))}
            placeholder="TXN_..."
          />
        </div>
        <Textarea
          label="Description"
          required
          value={form.description}
          onChange={(e) => { setForm(prev => ({ ...prev, description: e.target.value })); setErrors(prev => ({ ...prev, description: '' })); }}
          rows={4}
          placeholder="Describe the issue in detail..."
          error={errors.description}
        />
        {form.customerId && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-xs text-text-secondary">Linked to existing customer <span className="font-semibold text-text-primary">{form.customerEmail}</span></p>
            <button type="button" onClick={clearCustomer} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-error transition focus-ring">
              <X className="w-3.5 h-3.5" /> Unlink
            </button>
          </div>
        )}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md text-xs font-semibold transition focus-ring flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Create Ticket</button>
        </div>
      </form>
    </Modal>
  );
}
