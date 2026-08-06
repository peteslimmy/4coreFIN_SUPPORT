import { useState, useMemo } from 'react';
import { Users, Search, Plus, X, Phone, Mail, Ticket, Edit2, Trash2, ChevronRight, ChevronLeft, UserCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { syncCustomerCreate, syncCustomerUpdate, syncCustomerDelete } from '../lib/sync';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import type { CustomerRecord } from '../types/app';
import PageTransition from '../components/layout/PageTransition';

export default function CustomersPage() {
  const { isLoading, customers, setCustomers, tickets, showToast, logAuditAction, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showMobileList, setShowMobileList] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', businessUnit: '', notes: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() =>
    customers.filter(c =>
      !search || c.firstName.toLowerCase().includes(search.toLowerCase()) ||
      c.lastName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.businessUnit.toLowerCase().includes(search.toLowerCase())
    ), [customers, search]);

  const linkedTickets = useMemo(() => {
    if (!selected) return [];
    const byId = tickets.filter(t => t.customerId && t.customerId === selected.id);
    if (byId.length > 0) return byId;
    return tickets.filter(t => t.customerEmail?.toLowerCase() === selected.email.toLowerCase());
  }, [selected, tickets]);

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', email: '', phone: '', businessUnit: '', notes: '' });
    setFormErrors({});
    setEditingId(null);
    setShowForm(false);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email format';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const clearError = (field: string) => setFormErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  const handleSave = () => {
    if (!validate()) return;
    if (editingId) {
      const updatedCustomers = customers.map(c => c.id === editingId ? { ...c, ...form, totalTickets: c.totalTickets } : c);
      setCustomers(updatedCustomers);
      syncCustomerUpdate(editingId, form);
      showToast(`Updated customer ${form.firstName} ${form.lastName}`, 'success');
      logAuditAction(null, 'CUSTOMER_UPDATED', `Updated customer: ${form.firstName} ${form.lastName} (${form.email})`);
    } else {
      const newCustomer: CustomerRecord = {
        id: 'cust-' + Date.now(),
        ...form,
        businessUnit: form.businessUnit || currentUser.bu,
        createdAt: new Date().toISOString(),
        totalTickets: 0,
      };
      setCustomers(prev => [newCustomer, ...prev]);
      syncCustomerCreate(newCustomer);
      showToast(`Added customer ${form.firstName} ${form.lastName}`, 'success');
      logAuditAction(null, 'CUSTOMER_CREATED', `Created customer: ${form.firstName} ${form.lastName} (${form.email})`);
    }
    resetForm();
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    const c = customers.find(cust => cust.id === id);
    setCustomers(prev => prev.filter(cust => cust.id !== id));
    setDeleteConfirmId(null);
    const wasSelected = selected?.id === id;
    if (wasSelected) setSelected(null);
    try {
      await syncCustomerDelete(id);
      if (c) {
        showToast(`Deleted ${c.firstName} ${c.lastName}`, 'info');
        logAuditAction(null, 'CUSTOMER_DELETED', `Deleted customer: ${c.firstName} ${c.lastName} (${c.email})`);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        setCustomers(prev => (prev.some(x => x.id === id) ? prev : [c, ...prev]));
        if (c && wasSelected) setSelected(c);
        showToast(err instanceof Error ? err.message : 'Customer is linked to tickets and cannot be deleted', 'error');
      } else {
        setCustomers(prev => (prev.some(x => x.id === id) ? prev : [c, ...prev]));
        showToast('Failed to delete customer', 'error');
      }
    }
  };

  const handleEdit = (c: CustomerRecord) => {
    setForm({ firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, businessUnit: c.businessUnit, notes: c.notes || '' });
    setEditingId(c.id);
    setShowForm(true);
  };

  return (
    <PageTransition>
    <div className="flex-1 flex overflow-hidden">
      <div className={`${showMobileList ? 'fixed inset-0 z-30 flex' : 'hidden'} lg:flex w-96 lg:w-112 border-r border-border bg-surface-elevated flex-col shrink-0`}>
        {showMobileList && (
          <div className="fixed inset-0 bg-overlay z-30 lg:hidden" onClick={() => setShowMobileList(false)} role="presentation" aria-hidden="true" />
        )}
        <div className={`${showMobileList ? 'relative z-40' : ''} flex flex-col h-full w-96 bg-surface-elevated`}>
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Customers
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowMobileList(false)} className="lg:hidden p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors focus-ring" aria-label="Close customer list">&times;</button>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary-dark transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or BU..."
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3"><Skeleton variant="card" count={5} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Users className="w-10 h-10" />} title={search ? 'No matching customers' : 'No customers yet'} message={search ? 'Try a different search term' : 'Click "Add" to create your first customer record.'} />
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.map(c => (
                <motion.button
                  key={c.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.2 }}
                  onClick={() => { setSelected(c); setShowMobileList(false); }}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-surface-hover transition cursor-pointer flex items-center gap-3 ${
                    selected?.id === c.id ? 'bg-primary-light/50 ring-1 ring-primary' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-text-primary truncate">{c.firstName} {c.lastName}</p>
                    <p className="text-caption text-text-muted truncate">{c.email}</p>
                    <p className="text-caption text-text-muted truncate">{c.businessUnit} - {c.totalTickets} tickets</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-border shrink-0" />
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
        </div>
      </div>

      <div className="flex-1 bg-surface overflow-y-auto p-6 lg:p-8">
        {showForm ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto">
            <div className="bg-surface-elevated rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-primary">{editingId ? 'Edit Customer' : 'New Customer'}</h3>
                <button onClick={resetForm} aria-label="Close form" className="text-text-muted hover:text-text-primary cursor-pointer focus-ring rounded"><X className="w-4 h-4" /></button>
              </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-caption text-text-muted font-bold uppercase mb-1">First Name</label>
                    <input value={form.firstName} onChange={e => { setForm(f => ({ ...f, firstName: e.target.value })); clearError('firstName'); }} className={`w-full border rounded-lg px-3 py-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-primary ${formErrors.firstName ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.firstName} />
                    {formErrors.firstName && <p className="text-xs text-error mt-1" role="alert">{formErrors.firstName}</p>}
                  </div>
                  <div>
                    <label className="block text-caption text-text-muted font-bold uppercase mb-1">Last Name</label>
                    <input value={form.lastName} onChange={e => { setForm(f => ({ ...f, lastName: e.target.value })); clearError('lastName'); }} className={`w-full border rounded-lg px-3 py-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-primary ${formErrors.lastName ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.lastName} />
                    {formErrors.lastName && <p className="text-xs text-error mt-1" role="alert">{formErrors.lastName}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-caption text-text-muted font-bold uppercase mb-1">Email</label>
                  <input value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); clearError('email'); }} className={`w-full border rounded-lg px-3 py-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-primary ${formErrors.email ? 'border-error' : 'border-border'}`} aria-invalid={!!formErrors.email} />
                  {formErrors.email && <p className="text-xs text-error mt-1" role="alert">{formErrors.email}</p>}
                </div>
               <div>
                 <label className="block text-caption text-text-muted font-bold uppercase mb-1">Phone</label>
                 <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1-555-0000" className="w-full border border-border rounded-lg px-3 py-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-primary" />
               </div>
               <div>
                 <label className="block text-caption text-text-muted font-bold uppercase mb-1">Business Unit</label>
                 <input value={form.businessUnit} onChange={e => setForm(f => ({ ...f, businessUnit: e.target.value }))} placeholder={currentUser.bu} className="w-full border border-border rounded-lg px-3 py-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-primary" />
               </div>
               <div>
                 <label className="block text-caption text-text-muted font-bold uppercase mb-1">Notes</label>
                 <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border border-border rounded-lg px-3 py-2 text-xs outline-none transition-all duration-200 focus-ring focus:ring-1 focus:ring-primary" />
               </div>
               <div className="flex gap-2 pt-2">
                 <button onClick={handleSave} className="flex-1 bg-primary text-white text-xs font-semibold py-2 rounded-lg hover:bg-primary-dark transition cursor-pointer">
                   {editingId ? 'Update Customer' : 'Add Customer'}
                 </button>
                 <button onClick={resetForm} className="px-4 bg-surface text-text-muted text-xs font-bold py-2 rounded-lg hover:bg-surface-elevated transition cursor-pointer">Cancel</button>
               </div>
            </div>
          </motion.div>
        ) : selected ? (
          <motion.div key={selected.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
             <div className="bg-surface-elevated rounded-xl p-6">
               <div className="flex items-start justify-between">
                 <div className="flex items-center gap-4">
                   <button onClick={() => setShowMobileList(true)} className="lg:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition focus-ring mr-1" aria-label="Back to customer list"><ChevronLeft className="w-5 h-5" /></button>
                   <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center text-primary font-bold text-lg">
                     {selected.firstName.charAt(0)}{selected.lastName.charAt(0)}
                   </div>
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">{selected.firstName} {selected.lastName}</h2>
                    <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                      <Mail className="w-3.5 h-3.5" /> {selected.email}
                    </p>
                    <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                      <Phone className="w-3.5 h-3.5" /> {selected.phone || '-'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(selected)} aria-label={`Edit ${selected.name}`} className="p-2 text-text-muted hover:text-primary transition cursor-pointer focus-ring rounded"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(selected.id)} aria-label={`Delete ${selected.name}`} className="p-2 text-text-muted hover:text-error transition cursor-pointer focus-ring rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] text-text-muted font-bold uppercase">Business Unit</span>
                  <p className="font-semibold text-text-primary mt-0.5">{selected.businessUnit}</p>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted font-bold uppercase">Total Tickets</span>
                  <p className="font-semibold text-text-primary mt-0.5">{selected.totalTickets}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-text-muted font-bold uppercase">Created</span>
                  <p className="font-semibold text-text-primary mt-0.5">{new Date(selected.createdAt).toLocaleDateString()}</p>
                </div>
                {selected.notes && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-text-muted font-bold uppercase">Notes</span>
                    <p className="text-text-primary mt-0.5 text-[11px]">{selected.notes}</p>
                  </div>
                )}
              </div>
            </div>

             <div className="bg-surface-elevated rounded-xl p-6">
               <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4 flex items-center gap-1.5">
                 <Ticket className="w-3.5 h-3.5 text-primary" /> Linked Tickets ({linkedTickets.length})
               </h3>
               {linkedTickets.length === 0 ? (
                 <p className="text-xs text-text-muted italic">No tickets linked to this customer.</p>
               ) : (
                 <div className="space-y-2">
                   {linkedTickets.map(t => (
                     <div key={t.id} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2 text-xs">
                       <div>
                         <span className="font-bold text-text-primary">{t.id}</span>
                         <span className="text-text-muted ml-2">{t.category}</span>
                       </div>
                       <span className={`text-caption px-2 py-0.5 rounded font-bold ${
                         t.status === 'CLOSED' ? 'bg-surface text-text-muted' :
                         t.status === 'RESOLVED' ? 'bg-success-light text-success-dark' :
                         t.status === 'INVESTIGATE' ? 'bg-info-light text-info' :
                         t.status === 'ASSIGNED' ? 'bg-warning-light text-warning-dark' :
                         'bg-primary-light text-primary-dark'
                       }`}>{t.status.replace(/_/g, ' ')}</span>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          </motion.div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <UserCircle className="w-16 h-16 text-text-muted mx-auto mb-3" />
              <p className="text-sm font-semibold text-text-primary">Select a customer to view details</p>
              <p className="text-xs text-text-muted mt-1">Or click "Add" to create a new customer record</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-5">
                <button onClick={() => setShowMobileList(true)} className="lg:hidden flex items-center gap-1.5 px-4 py-2 bg-surface-elevated border border-border rounded-lg text-xs font-semibold text-text-primary hover:bg-surface-hover transition cursor-pointer"><Users className="w-3.5 h-3.5" /> Browse Customers</button>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="lg:hidden flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary-dark transition cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add Customer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    <ConfirmModal
      isOpen={deleteConfirmId !== null}
      onClose={() => setDeleteConfirmId(null)}
      onConfirm={handleConfirmDelete}
      title="Delete Customer"
      message={deleteConfirmId ? `Delete customer ${customers.find(c => c.id === deleteConfirmId)?.firstName || ''} ${customers.find(c => c.id === deleteConfirmId)?.lastName || ''}?` : ''}
      confirmLabel="Delete"
    />
    </PageTransition>
  );
}
