import { useState, useMemo } from 'react';
import { Mail, Search, Ticket, Clock, CheckCircle, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { CustomerRecord } from '../../types/app';
import Input from '../ui/Input';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import EmptyState from '../ui/EmptyState';

const DROPDOWN_CLOSE_DELAY = 150;

export default function CustomerRecordsView() {
  const { customers, tickets } = useApp();
  const [recordQuery, setRecordQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [recordPickerOpen, setRecordPickerOpen] = useState(false);

  const recordMatches = useMemo(() => {
    const q = recordQuery.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(c => c.email.toLowerCase().includes(q) || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [recordQuery, customers]);

  const selectedCustomerTickets = useMemo(() => {
    if (!selectedCustomer) return [];
    return tickets.filter(t => t.customerEmail.toLowerCase() === selectedCustomer.email.toLowerCase());
  }, [selectedCustomer, tickets]);

  return (
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
            onBlur={() => setTimeout(() => setRecordPickerOpen(false), DROPDOWN_CLOSE_DELAY)}
            placeholder="customer@example.com or name..."
            aria-label="Search customers by email or name"
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
              <Button onClick={() => { setSelectedCustomer(null); setRecordQuery(''); }} variant="ghost" size="sm">
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
  );
}
