import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, Search, Pencil, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { syncReferenceCreate, syncReferenceUpdate, syncReferenceDelete } from '../../lib/sync';
import { toSubmitPayload, syncCategorySla } from '../../lib/bulkImport';
import type { ReferenceKindDef } from '../../types/reference';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';
import EmptyState from '../ui/EmptyState';
import BulkImportModal from './BulkImportModal';
import { useApp } from '../../context/AppContext';

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

export default function CrudTable({ kind }: CrudTableProps) {
  const { showToast, currentRole, setBusinessUnits, setBusinessUnitCodes, setPartners, setPaymentChannels, setCategories, businessUnits, categories } = useApp();
  const [items, setItems] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<RowFormState>({ open: false, editingId: null, values: defaultValues(kind) });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

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
        setPaymentChannels(rows.map((v) => {
          if (typeof v === 'string') return v;
          if (v && typeof v === 'object' && 'value' in v) return String(v.value);
          return String(v);
        }));
      } else if (kind.kind === 'partners') {
        setPartners(rows.map((v) => String(v)));
      } else if (kind.kind === 'categories') {
        setCategories(rows as Array<Record<string, unknown>>);
      }
      if (kind.kind !== 'categories') {
        const catRows = await api.listReference('categories').catch(() => []);
        if (Array.isArray(catRows)) {
          setCategories(catRows as Array<Record<string, unknown>>);
        }
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [kind.kind, setBusinessUnits, setBusinessUnitCodes, setPaymentChannels, setPartners, setCategories]);

  // Reset local UI state when switching reference kinds (replaces keyed remount).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on kind switch
    setSearch('');
    setForm({ open: false, editingId: null, values: defaultValues(kind) });
    setFormError(null);
    setDeleteTarget(null);
    setDeleteError(null);
    setBulkOpen(false);
  }, [kind]);

  // Load business units when viewing users to populate the BU dropdown
  useEffect(() => {
    if (kind.kind === 'users') {
      const loadBusinessUnits = async () => {
        try {
          const rows = await api.listReference('businessUnits');
          const units = (rows as Array<Record<string, unknown>>).map((u) => String(u.name ?? ''));
          setBusinessUnits(units);
          setBusinessUnitCodes(Object.fromEntries((rows as Array<Record<string, unknown>>).map((u) => [String(u.name ?? ''), String(u.code ?? '')])));
        } catch (err) {
          console.error('Failed to load business units for user form:', err);
        }
      };
      loadBusinessUnits();
    }
  }, [kind.kind, setBusinessUnits, setBusinessUnitCodes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void load();
  }, [load]);

  const isValidRecord = useMemo(() => {
    if (!kind.isValid) return null;
    return kind.isValid;
  }, [kind.isValid]);

  const filtered = useMemo(() => {
    const pool = isValidRecord ? items.filter(isValidRecord) : items;
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((item) => {
      if (kind.stringItems) return String(item).toLowerCase().includes(q);
      const row = item as Record<string, unknown>;
      return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [items, search, kind.stringItems, isValidRecord]);

  const rowLabel = (item: unknown): string => {
    if (kind.stringItems) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'value' in item) return String(item.value);
      return '[Object]';
    }
    const row = item as Record<string, unknown>;
    const v = row[kind.fields[0]?.key] ?? row.id ?? '';
    return typeof v === 'object' ? '[Object]' : String(v);
  };

  const openCreate = () => setForm({ open: true, editingId: null, values: defaultValues(kind) });
  const openEdit = (item: unknown) => {
    if (kind.stringItems) {
      if (typeof item === 'string') {
        setForm({ open: true, editingId: item, values: { value: item } });
      } else if (item && typeof item === 'object' && 'value' in item) {
        setForm({ open: true, editingId: String(item.value), values: { value: String(item.value) } });
      } else {
        setForm({ open: true, editingId: String(item), values: { value: String(item) } });
      }
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
          } catch (e) {
            // Category saved but SLA sync failed — surface a gentle hint.
            showToast(`Category saved, but SLA rules sync failed: ${(e as Error).message}`, 'warning');
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
    if (kind.stringItems) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'value' in item) return String((item as Record<string, unknown>).value);
      return <span className="text-text-muted">[Object]</span>;
    }
    const row = item as Record<string, unknown>;
    const v = row[col.key];
    if (v === null || v === undefined || v === '') return <span className="text-text-muted">—</span>;
    if (typeof v === 'object') return <span className="text-text-muted">[Object]</span>;
    return String(v);
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
      // Handle dynamic options (functions) or static options
      const optionsArray = typeof f.options === 'function' 
        ? f.options({ businessUnits, categories: categories.map((c) => c.name) }) 
        : (f.options || []);
      return (
        <Select
          key={f.key}
          {...common}
          value={String(value ?? '')}
          options={optionsArray.map((o) => ({ value: o, label: o }))}
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
        <div className="flex flex-wrap items-center gap-2">
          {kind.supportBulkImport && (
            <Button variant="secondary" size="sm" icon={<Upload className="w-4 h-4" />} onClick={() => setBulkOpen(true)}>
              Import
            </Button>
          )}
          <Button onClick={openCreate} size="sm" icon={<Plus className="w-4 h-4" />}>
            Add {kind.label}
          </Button>
        </div>
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
            {filtered.map((item, idx) => {
              const rawId = kind.idOf(item);
              const id = typeof rawId === 'string' ? rawId : `${kind.kind}-${idx}`;
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

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        kind={kind}
        existingItems={items}
        onCompleted={() => void load()}
      />
    </div>
  );
}
