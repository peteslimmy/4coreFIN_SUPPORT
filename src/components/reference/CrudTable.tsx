import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { syncReferenceCreate, syncReferenceUpdate, syncReferenceDelete } from '../../lib/sync';
import type { ReferenceKindDef } from '../../types/reference';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';
import EmptyState from '../ui/EmptyState';
import { useApp } from '../../context/AppContext';

/**
 * Map a row to the payload actually sent to the server. Handles kind-specific
 * transforms (e.g. users store a single `name` column although the form edits
 * first/last name separately, and categories may carry an optional SLA).
 */
function toSubmitPayload(kind: ReferenceKindDef, item: Record<string, unknown>, editing: boolean): Record<string, unknown> {
  const payload = { ...item };
  if (kind.kind === 'users') {
    const first = String(payload.firstName ?? '').trim();
    const last = String(payload.lastName ?? '').trim();
    payload.name = [first, last].filter(Boolean).join(' ');
    delete payload.firstName;
    delete payload.lastName;
  }
  if (kind.kind === 'categories' && payload.slaHours !== undefined && payload.slaHours !== '') {
    payload.slaHours = Number(payload.slaHours);
  } else if (kind.kind === 'categories') {
    delete payload.slaHours;
  }
  return payload;
}

interface CrudTableProps {
  kind: ReferenceKindDef;
}

interface RowFormState {
  open: boolean;
  editingId: string | null;
  values: Record<string, unknown>;
}

function defaultValues(def: ReferenceKindDef): Record<string, unknown> {
  if (def.stringItems) return { value: '' };
  const values: Record<string, unknown> = {};
  for (const f of def.fields) values[f.key] = f.type === 'number' ? 1 : '';
  return values;
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Keep SLA rules in lockstep with a category's default SLA: when a category is
 * saved with an slaHours value, upsert an sla_rule for that category across all
 * priorities (creating missing rules, updating existing ones to the new value).
 * Called after the category itself has been persisted.
 */
async function syncCategorySla(category: string, slaHours: number): Promise<void> {
  const existing = (await api.listReference('slaRules')) as Array<Record<string, unknown>>;
  const catRules = existing.filter((r) => String(r.category ?? '') === category);
  const present = new Set(catRules.map((r) => String(r.priority ?? '')));
  for (const r of catRules) {
    await syncReferenceUpdate('slaRules', String(r.id), { ...r, durationHours: slaHours });
  }
  for (const p of PRIORITIES) {
    if (!present.has(p)) {
      await syncReferenceCreate('slaRules', { category, priority: p, durationHours: slaHours });
    }
  }
}

export default function CrudTable({ kind }: CrudTableProps) {
  const { showToast, currentRole, setBusinessUnits, setBusinessUnitCodes, setProviders, setPaymentChannels, setCategories } = useApp();
  const [items, setItems] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<RowFormState>({ open: false, editingId: null, values: defaultValues(kind) });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete = !kind.deleteRoles || kind.deleteRoles.includes(currentRole ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listReference(kind.kind);
      setItems(rows);
      if (kind.kind === 'businessUnits') {
        const units = (rows as Array<Record<string, unknown>>).map((u) => String(u.name ?? ''));
        setBusinessUnits(units);
        setBusinessUnitCodes(Object.fromEntries((rows as Array<Record<string, unknown>>).map((u) => [String(u.name ?? ''), String(u.code ?? '')])));
      } else if (kind.kind === 'paymentChannels') {
        setPaymentChannels(rows.map((v) => String(v)));
      } else if (kind.kind === 'providers') {
        setProviders(rows.map((v) => String(v)));
      } else if (kind.kind === 'categories') {
        setCategories(rows as Array<Record<string, unknown>>);
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [kind.kind, setBusinessUnits, setBusinessUnitCodes, setPaymentChannels, setProviders, setCategories]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      if (kind.stringItems) return String(item).toLowerCase().includes(q);
      const row = item as Record<string, unknown>;
      return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [items, search, kind.stringItems]);

  const rowLabel = (item: unknown): string => {
    if (kind.stringItems) return String(item);
    const row = item as Record<string, unknown>;
    return String(row[kind.fields[0]?.key] ?? row.id ?? '');
  };

  const openCreate = () => setForm({ open: true, editingId: null, values: defaultValues(kind) });
  const openEdit = (item: unknown) => {
    if (kind.stringItems) {
      setForm({ open: true, editingId: String(item), values: { value: String(item) } });
      return;
    }
    const row = item as Record<string, unknown>;
    let values: Record<string, unknown> = { ...row };
    if (kind.kind === 'users') {
      const full = String(row.name ?? row.firstName ?? '').trim();
      const parts = full.split(/\s+/);
      values = { ...row, firstName: row.firstName ?? (parts[0] || ''), lastName: row.lastName ?? (parts.slice(1).join(' ') || '') };
      delete values.name;
    }
    setForm({ open: true, editingId: kind.idOf(item), values });
  };

  const validate = (): string | null => {
    for (const f of kind.fields) {
      const v = form.values[f.key];
      if (f.required && (v === '' || v === undefined || v === null)) {
        return `${f.label} is required`;
      }
      if (f.type === 'number') {
        const n = Number(v);
        if (!Number.isFinite(n) || (f.min !== undefined && n < f.min)) {
          return `${f.label} must be at least ${f.min ?? 0}`;
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    try {
      if (kind.stringItems) {
        const value = String(form.values.value ?? '').trim();
        if (form.editingId) {
          await syncReferenceUpdate(kind.kind, form.editingId, value);
          showToast(`${kind.label} updated.`, 'success');
        } else {
          await syncReferenceCreate(kind.kind, value);
          showToast(`${kind.label} created.`, 'success');
        }
      } else {
        const payload = toSubmitPayload(kind, { ...form.values }, !!form.editingId);
        if (!form.editingId) {
          for (const f of kind.fields) {
            if (f.type === 'number') payload[f.key] = Number(payload[f.key]);
          }
        }
        for (const f of kind.fields) {
          if (f.type === 'password' && !String(payload[f.key] ?? '').trim()) delete payload[f.key];
        }
        if (form.editingId) {
          await syncReferenceUpdate(kind.kind, form.editingId, payload);
          showToast(`${kind.label} updated.`, 'success');
        } else {
          await syncReferenceCreate(kind.kind, payload);
          showToast(`${kind.label} created.`, 'success');
        }
        if (kind.kind === 'categories' && payload.slaHours && Number(payload.slaHours) > 0) {
          try {
            await syncCategorySla(String(payload.name), Number(payload.slaHours));
          } catch {
            // Category saved but SLA sync failed — surface a gentle hint.
            showToast('Category saved, but SLA sync failed.', 'warning');
          }
        }
      }
      setForm({ open: false, editingId: null, values: defaultValues(kind) });
      await load();
    } catch (e) {
      const message = (e as ApiError).status === 409 ? 'That value already exists.' : (e as Error).message;
      setFormError(message || 'Save failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await syncReferenceDelete(kind.kind, deleteTarget.id);
      showToast(`${kind.label} deleted.`, 'success');
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

  const renderCell = (item: unknown, col: { key: string; render?: (item: Record<string, unknown>) => ReactNode }) => {
    if (col.render) return col.render(item as Record<string, unknown>);
    if (kind.stringItems) return String(item);
    const row = item as Record<string, unknown>;
    const v = row[col.key];
    return v === null || v === undefined || v === '' ? <span className="text-text-muted">—</span> : String(v);
  };

  const renderField = (f: ReferenceKindDef['fields'][number]) => {
    const common = {
      id: `ref-${f.key}`,
      label: f.label,
      required: f.required,
      error: undefined,
    };
    const value = form.values[f.key];
    if (f.type === 'textarea') {
      return (
        <Textarea
          key={f.key}
          {...common}
          value={String(value ?? '')}
          placeholder={f.placeholder}
          onChange={(e) => setForm((p) => ({ ...p, values: { ...p.values, [f.key]: e.target.value } }))}
        />
      );
    }
    if (f.type === 'select') {
      return (
        <Select
          key={f.key}
          {...common}
          value={String(value ?? '')}
          options={(f.options || []).map((o) => ({ value: o, label: o }))}
          onChange={(e) => setForm((p) => ({ ...p, values: { ...p.values, [f.key]: e.target.value } }))}
        />
      );
    }
    return (
      <Input
        key={f.key}
        {...common}
        type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : f.type === 'password' ? 'password' : 'text'}
        value={String(value ?? '')}
        placeholder={f.placeholder}
        min={f.min}
        onChange={(e) => setForm((p) => ({ ...p, values: { ...p.values, [f.key]: e.target.value } }))}
      />
    );
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h4 className="text-sm font-bold text-text-primary">{kind.labelPlural}</h4>
          <p className="text-xs text-text-muted">{kind.description}</p>
        </div>
        <Button onClick={openCreate} size="sm" icon={<Plus className="w-4 h-4" />}>
          Add {kind.label}
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${kind.labelPlural.toLowerCase()}…`}
          className="w-full rounded-lg border border-border bg-surface-elevated pl-10 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-ring"
        />
      </div>

      {error && <div className="text-sm text-error bg-error-light border border-error/20 rounded-lg p-3 mb-4">{error}</div>}

      <div className="rounded-xl border border-border-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-hover/60 border-b border-border-subtle">
              {kind.columns.map((c) => (
                <th key={c.key} className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {c.header}
                </th>
              ))}
              <th className="text-right px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={kind.columns.length + 1}>
                  <EmptyState
                    title={search ? 'No matches' : `No ${kind.labelPlural.toLowerCase()} yet`}
                    message={search ? 'Try a different search.' : `Click “Add ${kind.label}” to create one.`}
                    className="py-8"
                  />
                </td>
              </tr>
            )}
            {filtered.map((item) => {
              const id = kind.idOf(item);
              return (
                <tr key={id} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-hover/40 transition-colors">
                  {kind.columns.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-text-primary">{renderCell(item, c)}</td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface transition-colors focus-ring"
                        aria-label={`Edit ${kind.label}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget({ id, label: rowLabel(item) })}
                          className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error-light transition-colors focus-ring"
                          aria-label={`Delete ${kind.label}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={form.open}
        onClose={() => setForm((p) => ({ ...p, open: false }))}
        title={form.editingId ? `Edit ${kind.label}` : `Add ${kind.label}`}
        size="md"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" size="md" onClick={() => setForm((p) => ({ ...p, open: false }))}>
              Cancel
            </Button>
            <Button size="md" onClick={handleSave}>
              {form.editingId ? 'Save Changes' : 'Add'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {kind.fields.map(renderField)}
          {formError && <div className="text-sm text-error bg-error-light border border-error/20 rounded-lg p-3">{formError}</div>}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        onConfirm={confirmDelete}
        title={`Delete ${kind.label}`}
        message={`Delete “${deleteTarget?.label}”? This cannot be undone.`}
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
