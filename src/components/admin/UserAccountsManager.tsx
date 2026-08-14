import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Building2, CreditCard, KeyRound, Check, Power } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { syncReferenceCreate, syncReferenceUpdate, syncReferenceDelete } from '../../lib/sync';
import { useApp } from '../../context/AppContext';
import type { UserRecord } from '../../types/admin';
import { UserRole } from '../../types/app';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';
import EmptyState from '../ui/EmptyState';

type AccountType = 'BU' | 'PARTNER';

const BU_ROLES = ['SUPER_ADMIN', 'EXECUTIVE', 'BU_SUPPORT_L1', 'BU_SUPPORT_L2', 'BU_SUPPORT_L3'] as const;

const ROLE_HELP: Record<string, string> = {
  SUPER_ADMIN: 'Global administrator with full platform access.',
  EXECUTIVE: 'Read-only oversight dashboards, compliance, and audit verification.',
  BU_SUPPORT_L1: 'First-line BU agent — files and tracks tickets, escalates to the payment partner.',
  BU_SUPPORT_L2: 'Senior BU agent — handles escalated tickets and partner escalations within the BU.',
  BU_SUPPORT_L3: 'Lead BU agent — final BU-side escalation tier for the assigned business unit.',
  PARTNER: 'Payment Partner account — handles tickets submitted to their payment partner.',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WizardState {
  open: boolean;
  editingId: string | null;
  accountType: AccountType;
  bu: string;
  partner: string;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

const emptyWizard: WizardState = {
  open: false,
  editingId: null,
  accountType: 'BU',
  bu: '',
  partner: '',
  role: 'BU_SUPPORT_L1',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
};

/** Normalize a server user row (name-based or first/last-name based) for display + editing. */
function toUserRecord(row: Record<string, unknown>): UserRecord {
  const name = String(row.name ?? row.firstName ?? '').trim();
  const parts = name.split(/\s+/);
  return {
    id: String(row.id ?? ''),
    firstName: String(row.firstName ?? parts[0] ?? ''),
    lastName: String(row.lastName ?? parts.slice(1).join(' ') ?? ''),
    name,
    email: String(row.email ?? ''),
    role: String(row.role ?? ''),
    bu: String(row.bu ?? ''),
    partner: String(row.partner ?? ''),
    accountType: String(row.accountType ?? (row.role === 'PARTNER' ? 'PARTNER' : 'BU')),
    phone: String(row.phone ?? ''),
    isActive: row.isActive === undefined ? true : Boolean(row.isActive),
  };
}

export default function UserAccountsManager() {
  const { showToast, businessUnits, partners, setBusinessUnits, setPartners, setUsers, currentRole } = useApp();
  const isSuperAdmin = currentRole === UserRole.SUPER_ADMIN;
  const [items, setItems] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<WizardState>(emptyWizard);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listReference('users');
      const normalized = (rows as Array<Record<string, unknown>>).map(toUserRecord);
      setItems(normalized);
      setUsers(normalized);
    } catch (e) {
      setError((e as Error).message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [setUsers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void load();
  }, [load]);

  // Ensure entity dropdowns are populated even if the admin cache is cold.
  useEffect(() => {
    if (businessUnits.length > 0 && partners.length > 0) return;
    void (async () => {
      try {
        const [buRows, partnerRows] = await Promise.all([
          businessUnits.length === 0 ? api.listReference('businessUnits') : Promise.resolve([]),
          partners.length === 0 ? api.listReference('partners') : Promise.resolve([]),
        ]);
        if (Array.isArray(buRows) && buRows.length > 0) {
          setBusinessUnits((buRows as Array<Record<string, unknown>>).map((u) => String(u.name ?? '')));
        }
        if (Array.isArray(partnerRows) && partnerRows.length > 0) {
          setPartners((partnerRows as unknown[]).map((v) => String(v)));
        }
      } catch {
        // dropdowns may stay empty; validation will surface missing entity.
      }
    })();
  }, [businessUnits.length, partners.length, setBusinessUnits, setPartners]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) =>
      [u.firstName, u.lastName, u.email, u.role, u.bu, u.partner, u.accountType]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  const openCreate = () => setForm({ ...emptyWizard, open: true });
  const openEdit = (u: UserRecord) =>
    setForm({
      open: true,
      editingId: u.id,
      accountType: (u.accountType as AccountType) || (u.role === 'PARTNER' ? 'PARTNER' : 'BU'),
      bu: u.bu,
      partner: u.partner,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone || '',
      password: '',
    });

  const setField = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    setFormError(null);
  };

  const switchAccountType = (accountType: AccountType) => {
    setForm((p) => {
      const next = { ...p, accountType };
      if (accountType === 'BU') {
        next.partner = '';
        next.role = next.role === 'PARTNER' ? 'BU_SUPPORT_L1' : next.role;
      } else {
        next.bu = '';
        next.role = 'PARTNER';
      }
      return next;
    });
    setFormError(null);
  };

  const validate = (): string | null => {
    if (form.accountType === 'BU') {
      if (!form.bu.trim()) return 'Select the Business Unit the user belongs to.';
      if (form.role !== 'SUPER_ADMIN' && form.role !== 'EXECUTIVE' && !form.role.startsWith('BU_SUPPORT')) {
        return 'Select a Business Unit role for this account.';
      }
    } else {
      if (!form.partner.trim()) return 'Select the Payment Partner the user belongs to.';
      if (form.role !== 'PARTNER') return 'Payment Partner accounts must use the PARTNER role.';
    }
    if (!form.firstName.trim()) return 'First name is required.';
    if (!form.email.trim()) return 'Email is required.';
    if (!EMAIL_RE.test(form.email)) return 'Enter a valid email address.';
    if (!form.editingId && !form.password) return 'Set an initial password (min 6 characters).';
    if (form.password && form.password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      name: [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' '),
      email: form.email.trim().toLowerCase(),
      accountType: form.accountType,
      role: form.role,
      phone: form.phone.trim(),
    };
    if (form.accountType === 'BU') {
      payload.bu = form.bu.trim();
      payload.partner = '';
    } else {
      payload.partner = form.partner.trim();
      payload.bu = '';
    }
    return payload;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      if (form.editingId) {
        if (form.password) payload.password = form.password;
        await syncReferenceUpdate('users', form.editingId, payload);
        showToast('User updated.', 'success');
      } else {
        payload.password = form.password;
        await syncReferenceCreate('users', payload);
        showToast('User created.', 'success');
      }
      setForm(emptyWizard);
      await load();
    } catch (e) {
      const message = (e as ApiError).status === 409 ? 'That email is already registered.' : (e as Error).message;
      setFormError(message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await syncReferenceDelete('users', deleteTarget.id);
      showToast('User deleted.', 'success');
      setDeleteTarget(null);
      await load();
    } catch (e) {
      const apiErr = e as ApiError;
      if (apiErr.status === 409) {
        setDeleteError(`"${deleteTarget.label}" is in use and cannot be deleted.`);
      } else {
        setDeleteError((e as Error).message || 'Delete failed');
      }
    }
  };

  const isEditing = !!form.editingId;

  const toggleActive = async (u: UserRecord) => {
    try {
      await api.toggleUserActivation(u.id, !u.isActive);
      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x)));
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x)));
      showToast(`${u.firstName} ${u.lastName}`.trim() + ` ${u.isActive ? 'suspended' : 'activated'}.`, 'success');
    } catch (e) {
      showToast((e as Error).message || 'Failed to toggle activation', 'error');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h4 className="text-sm font-bold text-text-primary">User Accounts</h4>
          <p className="text-xs text-text-muted">
            Staff accounts that sign in. Every account is either a Business Unit account (mapped to one BU) or a Payment
            Partner account (mapped to one payment partner). Customers are not created here — they are derived from submitted tickets.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" icon={<Plus className="w-4 h-4" />}>
          Add User
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          className="w-full rounded-lg border border-border bg-surface-elevated pl-10 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-ring"
        />
      </div>

      {error && <div className="text-sm text-error bg-error-light border border-error/20 rounded-lg p-3 mb-4">{error}</div>}

      <div className="rounded-xl border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-hover/60 border-b border-border-subtle">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Account Type</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Business Unit / Partner</th>
              <th className="text-right px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title={search ? 'No matches' : 'No users yet'}
                    message={search ? 'Try a different search.' : 'Click "Add User" to provision one.'}
                    className="py-8"
                  />
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-hover/40 transition-colors">
                <td className="px-4 py-3 text-text-primary">
                  <p className="font-medium text-text-primary">{u.firstName} {u.lastName}</p>
                  <p className="text-xs text-text-muted">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-hover text-text-muted">
                    {u.accountType === 'PARTNER' ? <CreditCard className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                    {u.accountType === 'PARTNER' ? 'Payment Partner' : 'Business Unit'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono text-text-secondary">{u.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      u.isActive === false ? 'bg-error-light text-error' : 'bg-success-light text-success'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${u.isActive === false ? 'bg-error' : 'bg-success'}`} />
                    {u.isActive === false ? 'Suspended' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{u.accountType === 'PARTNER' ? u.partner : u.bu}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {isSuperAdmin && (
                      <button
                        onClick={() => toggleActive(u)}
                        className={`p-1.5 rounded-md transition-colors focus-ring ${
                          u.isActive === false ? 'text-success hover:bg-success-light' : 'text-text-muted hover:text-error hover:bg-error-light'
                        }`}
                        aria-label={u.isActive === false ? 'Activate user' : 'Suspend user'}
                        title={u.isActive === false ? 'Activate user' : 'Suspend user'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface transition-colors focus-ring"
                      aria-label="Edit user"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: u.id, label: `${u.firstName} ${u.lastName}`.trim() || u.email })}
                      className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error-light transition-colors focus-ring"
                      aria-label="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={form.open}
        onClose={() => setForm(emptyWizard)}
        title={isEditing ? 'Edit User' : 'Add User'}
        size="md"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" size="md" onClick={() => setForm(emptyWizard)}>
              Cancel
            </Button>
            <Button size="md" onClick={handleSave} loading={saving}>
              {isEditing ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Step 1 — Account type */}
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">
              Account type <span className="text-error">*</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => switchAccountType('BU')}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition focus-ring cursor-pointer ${
                  form.accountType === 'BU'
                    ? 'border-accent/50 bg-accent/10 ring-1 ring-accent/30'
                    : 'border-border hover:bg-surface-hover'
                }`}
                aria-pressed={form.accountType === 'BU'}
              >
                <Building2 className={`w-5 h-5 mt-0.5 ${form.accountType === 'BU' ? 'text-accent' : 'text-text-muted'}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">Business Unit account</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Belongs to a specific business unit. Can file tickets for that BU and escalate within the ticket's payment partner.
                  </p>
                </div>
                {form.accountType === 'BU' && <Check className="w-4 h-4 text-accent mt-0.5" />}
              </button>
              <button
                type="button"
                onClick={() => switchAccountType('PARTNER')}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition focus-ring cursor-pointer ${
                  form.accountType === 'PARTNER'
                    ? 'border-accent/50 bg-accent/10 ring-1 ring-accent/30'
                    : 'border-border hover:bg-surface-hover'
                }`}
                aria-pressed={form.accountType === 'PARTNER'}
              >
                <CreditCard className={`w-5 h-5 mt-0.5 ${form.accountType === 'PARTNER' ? 'text-accent' : 'text-text-muted'}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">Payment Partner account</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Belongs to a payment partner. Handles tickets submitted to that partner and stays inside its partner domain.
                  </p>
                </div>
                {form.accountType === 'PARTNER' && <Check className="w-4 h-4 text-accent mt-0.5" />}
              </button>
            </div>
          </div>

          {/* Step 2 — Entity + role */}
          {form.accountType === 'BU' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label={isEditing ? 'Business Unit' : 'Step 2 — Business Unit'}
                required
                value={form.bu}
                placeholder="Select business unit"
                options={businessUnits.map((b) => ({ value: b, label: b }))}
                onChange={(e) => setField('bu', e.target.value)}
              />
              <Select
                label="Role"
                required
                value={form.role}
                options={BU_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
                onChange={(e) => {
                  setField('role', e.target.value);
                  setFormError(null);
                }}
              />
              <div className="sm:col-span-2">
                <p className="text-xs text-text-muted bg-surface-hover rounded-lg p-3" role="status">
                  {ROLE_HELP[form.role] || 'Choose a role for this business-unit account.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label={isEditing ? 'Payment Partner' : 'Step 2 — Payment Partner'}
                required
                value={form.partner}
                placeholder="Select payment partner"
                options={partners.map((p) => ({ value: p, label: p }))}
                onChange={(e) => setField('partner', e.target.value)}
              />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1.5">Role</p>
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-surface-hover">
                  <KeyRound className="w-4 h-4 text-text-muted" />
                  <span className="text-sm font-mono text-text-secondary">PARTNER</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{ROLE_HELP.PARTNER}</p>
              </div>
            </div>
          )}

          {/* Step 3 — Credentials */}
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-text-primary mb-3">{isEditing ? 'Profile' : 'Step 3 — Credentials'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="First name" required value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} />
              <Input label="Last name" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} />
              <Input label="Email" type="email" required value={form.email} onChange={(e) => setField('email', e.target.value)} />
              <Input label="Phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              <div className="sm:col-span-2">
                <Input
                  label={isEditing ? 'New password (only if resetting)' : 'Initial password'}
                  type="password"
                  required={!isEditing}
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  helperText={isEditing ? 'Leave blank to keep the current password. Min 6 characters.' : 'Min 6 characters. The user must change it on first login.'}
                />
              </div>
            </div>
          </div>

          {formError && <div className="text-sm text-error bg-error-light border border-error/20 rounded-lg p-3">{formError}</div>}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        onConfirm={confirmDelete}
        title="Delete user"
        message={`Delete "${deleteTarget?.label}"? The account will be removed and the user will no longer be able to sign in.`}
        confirmLabel="Delete"
      />

      {deleteError && (
        <Modal open={!!deleteError} onClose={() => setDeleteError(null)} title="Cannot delete" size="sm">
          <p className="text-sm text-text-muted">{deleteError}</p>
        </Modal>
      )}
    </div>
  );
}

function roleLabel(role: string): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'Super Admin';
    case 'EXECUTIVE': return 'Executive';
    case 'BU_SUPPORT_L1': return 'BU Support — Level 1';
    case 'BU_SUPPORT_L2': return 'BU Support — Level 2';
    case 'BU_SUPPORT_L3': return 'BU Support — Level 3';
    default: return role;
  }
}