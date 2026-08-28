import { useState } from 'react';
import { Search, X } from 'lucide-react';
import Input from '../ui/Input';
import type { CustomerRecord } from '../../types/app';
import { useApp } from '../../context/AppContext';

const DROPDOWN_CLOSE_DELAY = 150;

interface CustomerIdentityStepProps {
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  customerId?: string;
  customerQuery: string;
  setCustomerQuery: (v: string) => void;
  identityErrors: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onClearCustomer: () => void;
}

export default function CustomerIdentityStep({
  customerFirstName, customerLastName, customerEmail, customerPhone, customerId,
  customerQuery, setCustomerQuery, identityErrors, onChange, onClearCustomer,
}: CustomerIdentityStepProps) {
  const { customers } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);

  const matches = customers
    .filter(c => {
      const q = customerQuery.trim().toLowerCase();
      return q && (c.email.toLowerCase().includes(q) || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q));
    })
    .slice(0, 8);

  const pickCustomer = (c: CustomerRecord) => {
    onChange('customerId', c.id);
    onChange('customerFirstName', c.firstName || '');
    onChange('customerLastName', c.lastName || '');
    onChange('customerEmail', c.email);
    onChange('customerPhone', c.phone || '');
    setCustomerQuery('');
    setPickerOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Input
          label="Find Existing Customer"
          icon={<Search className="w-4 h-4" />}
          value={customerQuery}
          onChange={(e) => { setCustomerQuery(e.target.value); setPickerOpen(true); }}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setTimeout(() => setPickerOpen(false), DROPDOWN_CLOSE_DELAY)}
          placeholder="Search by name or email (optional)"
          helperText={customerId ? 'Customer linked to this complaint.' : 'No match? Just type the details below and a customer record is created automatically.'}
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

      {customerId && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-xs text-text-secondary">Linked to existing customer <span className="font-semibold text-text-primary">{customerEmail}</span></p>
          <button type="button" onClick={onClearCustomer} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-error transition focus-ring">
            <X className="w-3.5 h-3.5" /> Unlink
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Customer First Name"
          value={customerFirstName}
          onChange={(e) => onChange('customerFirstName', e.target.value)}
          placeholder="e.g. Chinedu"
          helperText="Optional"
        />
        <Input
          label="Customer Last Name"
          value={customerLastName}
          onChange={(e) => onChange('customerLastName', e.target.value)}
          placeholder="e.g. Okonkwo"
          helperText="Optional"
        />
        <Input
          label="Customer Email"
          type="email"
          value={customerEmail}
          onChange={(e) => onChange('customerEmail', e.target.value)}
          placeholder="customer@example.com"
          error={identityErrors.customerEmail}
          helperText="Optional"
        />
        <Input
          label="Customer Phone"
          value={customerPhone}
          onChange={(e) => onChange('customerPhone', e.target.value)}
          placeholder="+234..."
          helperText="Optional"
        />
      </div>
    </div>
  );
}
