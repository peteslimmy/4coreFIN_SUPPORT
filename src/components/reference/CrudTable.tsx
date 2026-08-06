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
  const { showToast, currentRole } = useApp();
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
    } catch (e) {
      setError((e as Error).message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [kind.kind]);

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
    setForm({ open: true, editingId: kind.idOf(item), values: { ...(item as Record<string, unknown>) } });
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
        const payload = { ...form.values };
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
