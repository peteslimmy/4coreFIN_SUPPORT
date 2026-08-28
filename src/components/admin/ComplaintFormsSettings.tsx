import React, { useMemo, useState, useRef } from 'react';
import {
  Trash2, ArrowDown, Eye, EyeOff, Save, Copy, GripVertical, Plus, X, Check,
  Search, Type, Hash, Banknote, ListFilter, CalendarDays, AlignLeft, Info,
  Wand2, Settings2, CopyPlus, Layers, RotateCcw, Upload, Download, Table2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Toggle from '../ui/Toggle';
import Textarea from '../ui/Textarea';
import Modal from '../ui/Modal';
import { FIELD_LIBRARY, getBuFormConfig, buildDefaultBuFormConfig, mergeConfigs } from '../../lib/formConfigs';
import type { BuFormConfig, FormFieldDefinition, FormFieldType, FormFieldValidation, ParseFieldError, ImportResult, MergeSummary } from '../../types/forms';
import { syncConfig } from '../../lib/sync';
import { authorizedFetch } from '../../lib/api';
import { parseConfigUpload } from '../../lib/parseConfigUpload';
import { downloadCsvTemplate, downloadConfigCsv } from '../../lib/csvTemplate';

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Short Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency (₦)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Long Text' },
];

const FIELD_TYPE_META: Record<FormFieldType, { icon: typeof Type; chip: string; accent: string }> = {
  text: { icon: Type, chip: 'bg-primary/10 text-primary', accent: 'text-primary' },
  number: { icon: Hash, chip: 'bg-success/10 text-success', accent: 'text-success' },
  currency: { icon: Banknote, chip: 'bg-warning/10 text-warning', accent: 'text-warning' },
  select: { icon: ListFilter, chip: 'bg-primary/10 text-primary', accent: 'text-primary' },
  date: { icon: CalendarDays, chip: 'bg-error/10 text-error', accent: 'text-error' },
  textarea: { icon: AlignLeft, chip: 'bg-info/10 text-info', accent: 'text-info' },
  file: { icon: Type, chip: 'bg-primary/10 text-primary', accent: 'text-primary' },
};

function TypeIcon({ type, className = 'w-4 h-4' }: { type: FormFieldType; className?: string }) {
  const Icon = FIELD_TYPE_META[type].icon;
  return <Icon className={className} />;
}

function DuplicateBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
      <CopyPlus className="w-3 h-3" /> Dupe key
    </span>
  );
}

function RequiredBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-error/10 text-error">
      <span className="w-1 h-1 rounded-full bg-error" /> Required
    </span>
  );
}

function OptionChips({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const clean = draft.trim();
    if (!clean) return;
    if (value.includes(clean)) return;
    onChange([...value, clean]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((o, i) => (
          <span key={`${o}-${i}`} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-surface-elevated border border-border text-text-primary">
            {o}
            <button type="button" aria-label={`Remove ${o}`} onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-text-muted hover:text-error transition-colors cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-text-muted italic">No options yet.</span>}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an option and press Add" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button variant="secondary" size="sm" onClick={add} icon={<Plus className="w-3.5 h-3.5" />}>Add</Button>
      </div>
    </div>
  );
}

function ValidationEditor({ field, onChange }: { field: FormFieldDefinition; onChange: (patch: Partial<FormFieldDefinition>) => void }) {
  const validation: FormFieldValidation = field.validation || {};
  const setValidation = (patch: FormFieldValidation) => onChange({ validation: { ...validation, ...patch } });
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">Validation rules are applied when customers fill the form.</p>
      {(field.type === 'number' || field.type === 'currency') && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Min" type="number" value={validation.min ?? ''} onChange={e => setValidation({ min: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Any" />
          <Input label="Max" type="number" value={validation.max ?? ''} onChange={e => setValidation({ max: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Any" />
        </div>
      )}
      {field.type === 'text' && (
        <div className="space-y-3">
          <Input label="Pattern (regex)" value={validation.pattern ?? ''} onChange={e => setValidation({ pattern: e.target.value || undefined })} placeholder="e.g. ^TXN_\d+$" />
          <Input label="Error message" value={validation.message ?? ''} onChange={e => setValidation({ message: e.target.value || undefined })} placeholder="e.g. Must start with TXN_" />
        </div>
      )}
      {(field.type === 'text' || field.type === 'number' || field.type === 'currency' || field.type === 'date') && (
        <div className="text-xs text-text-muted">Tip: use min/max for numbers, pattern + message for text format.</div>
      )}
    </div>
  );
}

function ShowIfEditor({ field, fields, onChange }: { field: FormFieldDefinition; fields: FormFieldDefinition[]; onChange: (patch: Partial<FormFieldDefinition>) => void }) {
  const candidates = fields.filter(f => f.id !== field.id && f.enabled);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Show only when"
          value={field.showIf?.field ?? ''}
          onChange={e => {
            const f = e.target.value;
            if (!f) onChange({ showIf: undefined });
            else onChange({ showIf: { field: f, equals: field.showIf?.equals ?? '' } });
          }}
          options={[{ value: '', label: '— Always show —' }, ...candidates.map(c => ({ value: c.id, label: c.label }))]}
        />
        {field.showIf && (
          <Input
            label="Equals value"
            value={String(field.showIf.equals ?? '')}
            onChange={e => onChange({ showIf: { ...field.showIf, equals: e.target.value } })}
            placeholder="e.g. Payment Dispute"
          />
        )}
      </div>
      {field.showIf && (
        <p className="text-xs text-text-muted flex items-center gap-1"><Info className="w-3.5 h-3.5" /> This field only appears when the selected field matches the value.</p>
      )}
    </div>
  );
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  targetBu: string;
  onTargetBuChange: (bu: string) => void;
  onConfirm: (fields: FormFieldDefinition[], summary: MergeSummary) => void;
  importing: boolean;
}

function ImportConfigModal({ open, onClose, targetBu, onTargetBuChange, onConfirm, importing }: ImportModalProps) {
  const [, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [mergeSummary, setMergeSummary] = useState<MergeSummary | null>(null);
  const [mergedFields, setMergedFields] = useState<FormFieldDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { buFormConfigs } = useApp();

  const existingConfig = useMemo(
    () => getBuFormConfig(buFormConfigs, targetBu),
    [buFormConfigs, targetBu]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) {
      setError('File exceeds 5MB limit. Please use a smaller file.');
      setParsed(null);
      setMergeSummary(null);
      setMergedFields(null);
      return;
    }
    setError(null);
    setParsed(null);
    setMergeSummary(null);
    setMergedFields(null);
    setParsing(true);
    try {
      const result = await parseConfigUpload(selected);
      setParsed(result);
      if (result.errors.length > 0) {
        setError(`${result.errors.length} row(s) had errors. Fix them and re-upload.`);
        return;
      }
      if (result.fields.length === 0) {
        setError('No valid fields found in file.');
        return;
      }
      const { config: merged, summary } = mergeConfigs(existingConfig, result.fields);
      setMergedFields(merged.fields);
      setMergeSummary(summary);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = () => {
    if (!mergedFields || !mergeSummary) return;
    onConfirm(mergedFields, mergeSummary);
  };

  const handleClose = () => {
    setFile(null);
    setParsed(null);
    setMergeSummary(null);
    setMergedFields(null);
    setError(null);
    setParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Form Configuration" size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Target Business Unit"
            value={targetBu}
            onChange={e => { onTargetBuChange(e.target.value); setParsed(null); setMergeSummary(null); setMergedFields(null); setError(null); }}
            options={[
              { value: 'POSSAP', label: 'POSSAP' },
              { value: 'RETAIL-B', label: 'RETAIL-B' },
              { value: 'CORPORATE', label: 'CORPORATE' },
              { value: 'SME', label: 'SME' },
              { value: 'DIGITAL', label: 'DIGITAL' },
            ]}
          />
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Configuration File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={parsing}
              className="block w-full text-sm text-text-primary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-accent file:text-[#fff] file:text-xs file:font-semibold file:cursor-pointer hover:file:bg-accent-dark disabled:opacity-50"
            />
            <p className="text-[11px] text-text-muted mt-1">.csv or .xlsx, max 5 MB</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outlined" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={() => downloadCsvTemplate()}>
            Download CSV Template
          </Button>
          <span className="text-xs text-text-muted">Use this as a starting point for your BU</span>
        </div>

        {error && (
          <div className="rounded-xl border border-error/40 bg-error/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-error flex items-center gap-1.5"><X className="w-4 h-4" /> Upload Error</p>
            <p className="text-xs text-text-secondary">{error}</p>
            {parsed && parsed.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto mt-2 border border-error/20 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-error/10 text-error">
                      <th className="text-left px-3 py-1.5 font-semibold">Row</th>
                      <th className="text-left px-3 py-1.5 font-semibold">Field</th>
                      <th className="text-left px-3 py-1.5 font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.errors.map((err: ParseFieldError, idx: number) => (
                      <tr key={idx} className="border-t border-error/10">
                        <td className="px-3 py-1.5 text-text-secondary">{err.row}</td>
                        <td className="px-3 py-1.5 font-mono text-text-secondary">{err.fieldId}</td>
                        <td className="px-3 py-1.5 text-error">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {mergeSummary && mergedFields && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success">
                +{mergeSummary.added} new
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent">
                ~{mergeSummary.updated} updated
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-elevated text-text-secondary">
                ={mergeSummary.unchanged} unchanged
              </span>
              <span className="text-xs text-text-muted ml-auto">Final field count: {mergeSummary.finalFieldCount}</span>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-elevated border-b border-border">
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5"><Table2 className="w-3.5 h-3.5 text-text-muted" /> Merge Preview ({mergedFields.length} fields — existing fields not in this file are preserved)</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-card text-text-muted">
                      <th className="text-left px-3 py-2 font-semibold">Order</th>
                      <th className="text-left px-3 py-2 font-semibold">Field ID</th>
                      <th className="text-left px-3 py-2 font-semibold">Label</th>
                      <th className="text-left px-3 py-2 font-semibold">Type</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedFields.map(f => {
                      const isNew = !existingConfig.fields.some(ef => ef.id === f.id);
                      const isUpdated = existingConfig.fields.some(ef => ef.id === f.id);
                      const status = isNew
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-success/10 text-success">Added</span>
                        : isUpdated
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">Updated</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-surface-elevated text-text-muted">Unchanged</span>;
                      return (
                        <tr key={f.id} className="border-t border-border hover:bg-surface-hover transition-colors">
                          <td className="px-3 py-2 text-text-muted font-mono">{f.order}</td>
                          <td className="px-3 py-2 font-mono text-text-primary">{f.id}</td>
                          <td className="px-3 py-2 text-text-primary">{f.label}</td>
                          <td className="px-3 py-2"><span className="capitalize">{f.type}</span></td>
                          <td className="px-3 py-2">{status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {parsing && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Parsing file...
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button variant="outlined" onClick={handleClose} disabled={importing}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!mergedFields || !!error || parsing || importing} icon={<Check className="w-4 h-4" />}>
            {importing ? 'Importing...' : 'Confirm & Import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddFieldModal({ open, onClose, draftFields, onAdd }: { open: boolean; onClose: () => void; draftFields: FormFieldDefinition[]; onAdd: (field: FormFieldDefinition) => void }) {
  const [tab, setTab] = useState<'library' | 'custom'>('library');
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FormFieldType>('text');
  const [placeholder, setPlaceholder] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [required, setRequired] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIELD_LIBRARY.filter(f => !q || f.label.toLowerCase().includes(q) || f.type.toLowerCase().includes(q));
  }, [query]);

  const existingIds = new Set(draftFields.map(f => f.id));

  const addCustom = () => {
    if (!label.trim()) return;
    onAdd({
      id: `custom_${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`,
      label: label.trim(),
      type,
      options: type === 'select' ? options : undefined,
      placeholder: placeholder.trim() || undefined,
      required,
      enabled: true,
      duplicateKey: false,
      order: draftFields.length,
    });
    setLabel('');
    setPlaceholder('');
    setOptions([]);
    setRequired(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a Field" size="lg">
      <div className="space-y-4">
        <div className="inline-flex rounded-lg bg-surface-card border border-border p-1 gap-1">
          {(['library', 'custom'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${tab === t ? 'bg-accent text-[#fff] shadow-2' : 'text-text-secondary hover:text-text-primary'}`}>
              {t === 'library' ? 'Field Library' : 'Create Custom'}
            </button>
          ))}
        </div>
        {tab === 'library' ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the field library..." className="w-full rounded-lg border border-border bg-surface-elevated pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-ring focus:border-primary transition-all" />
            </div>
            {filtered.length === 0 ? (
              <p className="text-body-sm text-text-muted text-center py-6">No library fields match "{query}". Try the Custom tab.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {filtered.map(lib => {
                  const added = existingIds.has(lib.id);
                  const Icon = FIELD_TYPE_META[lib.type].icon;
                  return (
                    <button key={lib.id} type="button" disabled={added} onClick={() => onAdd({ id: lib.id, label: lib.label, type: lib.type, options: lib.options, placeholder: lib.placeholder, required: false, enabled: true, duplicateKey: !!lib.duplicateKey, order: draftFields.length })} className={`group text-left rounded-xl border p-3 transition-all duration-150 ${added ? 'border-border bg-surface-elevated opacity-60 cursor-not-allowed' : 'border-border bg-surface-card hover:border-accent hover:shadow-2 cursor-pointer'}`}>
                      <div className="flex items-start gap-2.5">
                        <span className={`shrink-0 rounded-lg p-2 ${FIELD_TYPE_META[lib.type].chip}`}><Icon className="w-4 h-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-text-primary truncate">{lib.label}</span>
                          <span className="block text-[11px] text-text-muted capitalize">{lib.type}</span>
                        </span>
                        <span className={`shrink-0 ${added ? 'text-success' : 'text-accent opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                          {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </span>
                      </div>
                      {lib.placeholder && <p className="mt-1.5 text-[11px] font-mono text-text-muted truncate">{lib.placeholder}</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Input label="Field label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. NIP Session ID" autoFocus />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Field type" value={type} onChange={e => setType(e.target.value as FormFieldType)} options={FIELD_TYPES.map(t => ({ value: t.value, label: t.label }))} />
              <Input label="Placeholder (optional)" value={placeholder} onChange={e => setPlaceholder(e.target.value)} />
            </div>
            {type === 'select' && <OptionChips value={options} onChange={setOptions} />}
            <label className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
              <Toggle checked={required} onChange={setRequired} /> Required field
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outlined" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={addCustom} disabled={!label.trim()}>Add Field</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function ComplaintFormsSettings() {
  const { businessUnits, buFormConfigs, setBuFormConfigs, showToast, logAuditAction, currentUser } = useApp();
  const [selectedBu, setSelectedBu] = useState<string>(businessUnits[0] || 'POSSAP');
  const [draft, setDraft] = useState<BuFormConfig>(() => getBuFormConfig(buFormConfigs, businessUnits[0] || 'POSSAP'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTargetBu, setImportTargetBu] = useState<string>(businessUnits[0] || 'POSSAP');
  const [importing, setImporting] = useState(false);

  const savedConfig = useMemo(() => getBuFormConfig(buFormConfigs, selectedBu), [buFormConfigs, selectedBu]);
  const isDirty = useMemo(
    () => JSON.stringify(draft.fields.map(f => ({ ...f, order: undefined }))) !== JSON.stringify(savedConfig.fields.map(f => ({ ...f, order: undefined }))),
    [draft, savedConfig]
  );

  const activeFields = draft.fields.filter(f => f.enabled);
  const hiddenFields = draft.fields.filter(f => !f.enabled);
  const selectedField = draft.fields.find(f => f.id === selectedId) ?? null;

  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';

  const selectBu = (bu: string) => {
    setSelectedBu(bu);
    setDraft(getBuFormConfig(buFormConfigs, bu));
    setSelectedId(null);
    setDragIndex(null);
    setOverIndex(null);
  };

  const updateSelectedField = (patch: Partial<FormFieldDefinition>) => {
    if (!selectedId) return;
    setDraft(prev => ({ ...prev, fields: prev.fields.map(f => f.id === selectedId ? { ...f, ...patch } : f) }));
  };

  const removeField = (id: string) => {
    setDraft(prev => ({ ...prev, fields: prev.fields.filter(f => f.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateField = (id: string) => {
    const src = draft.fields.find(f => f.id === id);
    if (!src) return;
    const copy: FormFieldDefinition = { ...src, id: `${id}_copy_${Date.now().toString(36)}`, label: `${src.label} (copy)`, order: draft.fields.length };
    setDraft(prev => ({ ...prev, fields: [...prev.fields, copy] }));
    setSelectedId(copy.id);
    showToast(`Duplicated "${src.label}".`, 'success');
  };

  const toggleEnabled = (id: string) => {
    const f = draft.fields.find(x => x.id === id);
    if (!f) return;
    const next = { ...f, enabled: !f.enabled };
    setDraft(prev => ({ ...prev, fields: prev.fields.map(x => x.id === id ? next : x) }));
    if (selectedId === id) setSelectedId(null);
    showToast(`"${f.label}" is now ${next.enabled ? 'visible' : 'hidden'} on the form.`, 'info');
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setDraft(prev => {
      const fields = [...prev.fields];
      const [moved] = fields.splice(from, 1);
      fields.splice(to, 0, moved);
      return { ...prev, fields };
    });
  };

  const handleDrop = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) reorder(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  };

  const addField = (field: FormFieldDefinition) => {
    if (draft.fields.some(f => f.id === field.id)) {
      showToast(`"${field.label}" is already on this form.`, 'error');
      return;
    }
    setDraft(prev => ({ ...prev, fields: [...prev.fields, field] }));
    setSelectedId(field.id);
    setAddOpen(false);
    showToast(`Added "${field.label}" to ${selectedBu}.`, 'success');
  };

  const duplicateToAll = () => {
    const all = buFormConfigs
      .filter(c => c.bu !== draft.bu)
      .map(c => ({ ...c, fields: draft.fields.map(f => ({ ...f })), version: c.version + 1, updatedAt: new Date().toISOString(), updatedBy: `${currentUser.firstName} ${currentUser.lastName}` }));
    const merged = [draft, ...all];
    businessUnits.forEach(bu => {
      if (!merged.some(c => c.bu === bu)) merged.push(buildDefaultBuFormConfig(bu));
    });
    setBuFormConfigs(merged);
    syncConfig('buFormConfigs', merged);
    logAuditAction(null, 'ADMIN_FORM_CONFIG_COPIED', `Copied ${draft.bu} transaction form to all business units.`);
    showToast(`Copied ${draft.bu} form to all ${merged.length} business units.`, 'success');
  };

  const resetToDefault = () => {
    const defaults = buildDefaultBuFormConfig(selectedBu);
    setDraft(defaults);
    setSelectedId(null);
    showToast(`Reset ${selectedBu} form to the default layout.`, 'info');
  };

  const saveConfig = () => {
    const updated: BuFormConfig = {
      ...draft,
      version: draft.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: `${currentUser.firstName} ${currentUser.lastName}`,
    };
    const next = buFormConfigs.map(c => (c.bu === draft.bu ? updated : c));
    if (!next.some(c => c.bu === draft.bu)) next.push(updated);
    setBuFormConfigs(next);
    syncConfig('buFormConfigs', next);
    logAuditAction(null, 'ADMIN_FORM_CONFIG_UPDATED', `Updated transaction form for BU: ${draft.bu} (${draft.fields.length} fields).`);
    showToast(`Transaction form saved for ${draft.bu}.`, 'success');
  };

  const handleExportConfig = () => {
    downloadConfigCsv(draft, `form-config-${selectedBu.toLowerCase()}.csv`);
    logAuditAction(null, 'ADMIN_FORM_CONFIG_EXPORTED', `Downloaded ${selectedBu} form config as CSV.`);
    showToast(`Downloaded ${selectedBu} form config as CSV.`, 'success');
  };

  const handleImportConfirm = async (fields: FormFieldDefinition[], summary: MergeSummary) => {
    setImporting(true);
    try {
      const res = await authorizedFetch('/api/config/buFormConfigs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBu: importTargetBu, fields, version: draft.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Import failed on server');
      }
      const { config: updated } = await res.json();
      setBuFormConfigs(prev => {
        const next = prev.some(c => c.bu === importTargetBu)
          ? prev.map(c => c.bu === importTargetBu ? updated : c)
          : [...prev, updated];
        syncConfig('buFormConfigs', next);
        return next;
      });
      if (selectedBu === importTargetBu) {
        setDraft(getBuFormConfig([...buFormConfigs], importTargetBu));
      }
      logAuditAction(null, 'FORM_CONFIG_IMPORTED', `Imported ${updated.fields.length} fields for BU ${importTargetBu} via file upload.`);
      showToast(`Imported ${summary.added} new / ~${summary.updated} updated fields for ${importTargetBu}.`, 'success');
      setImportOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const importModalProps = {
    open: importOpen,
    onClose: () => setImportOpen(false),
    targetBu: importTargetBu,
    onTargetBuChange: setImportTargetBu,
    onConfirm: handleImportConfirm,
    importing,
  };

  const renderFieldRow = (f: FormFieldDefinition, index: number, isHidden: boolean) => {
    const meta = FIELD_TYPE_META[f.type];
    const isSelected = selectedId === f.id;
    const isDragging = dragIndex === index;
    const isOver = overIndex === index && dragIndex !== null && overIndex !== dragIndex;
    return (
      <div
        key={f.id}
        draggable={!isHidden}
        onDragStart={() => setDragIndex(index)}
        onDragOver={e => { e.preventDefault(); setOverIndex(index); }}
        onDrop={handleDrop}
        onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
        onClick={() => setSelectedId(f.id)}
        className={`group relative rounded-xl border p-3 transition-all duration-150 ${
          isDragging ? 'opacity-40 border-dashed' : isOver ? 'border-accent shadow-2 scale-[1.01]' : 'border-border'
        } ${isSelected ? 'ring-2 ring-accent/60 border-accent bg-surface-card' : 'bg-surface-card hover:border-border/70'} ${isHidden ? 'opacity-70' : 'cursor-pointer'}`}
      >
        {isOver && <span className="absolute -top-1 left-2 right-2 h-0.5 rounded bg-accent" />}
        <div className="flex items-center gap-3">
          {!isHidden && (
            <span className="shrink-0 text-text-muted cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 transition-opacity" title="Drag to reorder">
              <GripVertical className="w-4 h-4" />
            </span>
          )}
          <span className={`shrink-0 rounded-lg p-2 ${meta.chip}`}><TypeIcon type={f.type} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-primary truncate">{f.label}</span>
              <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.accent} bg-surface-elevated`}>{f.type}</span>
            </div>
            {(f.placeholder || f.helpText) && <p className="text-[11px] text-text-muted truncate mt-0.5">{f.helpText || f.placeholder}</p>}
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {f.required && <RequiredBadge />}
            {f.duplicateKey && <DuplicateBadge />}
          </div>
          <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" onClick={e => { e.stopPropagation(); toggleEnabled(f.id); }} title={isHidden ? 'Show on form' : 'Hide from form'} className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer">
              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); duplicateField(f.id); }} title="Duplicate field" className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer">
              <CopyPlus className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); removeField(f.id); }} title="Remove field" className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary flex items-center gap-2"><Settings2 className="w-4 h-4 text-accent" /> Complaint Form Builder</h3>
          <p className="text-body-sm text-text-muted mt-0.5">Drag fields to reorder, click to edit, and hide or duplicate with ease. Changes save per business unit.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            label="Business Unit"
            value={selectedBu}
            onChange={e => selectBu(e.target.value)}
            options={businessUnits.map(bu => ({ value: bu, label: bu }))}
          />
          <Button variant="outlined" size="sm" icon={<RotateCcw className="w-4 h-4" />} onClick={resetToDefault}>Reset</Button>
          <Button variant="outlined" size="sm" icon={<Copy className="w-4 h-4" />} onClick={duplicateToAll}>Copy to All BUs</Button>
          {isSuperAdmin && (
            <Button variant="secondary" size="sm" icon={<Upload className="w-4 h-4" />} onClick={() => setImportOpen(true)}>
              Import Config
            </Button>
          )}
          <Button variant="outlined" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExportConfig} title={`Download ${selectedBu} form config as CSV`}>
            Download CSV
          </Button>
          <Button variant="primary" size="sm" icon={<Save className="w-4 h-4" />} onClick={saveConfig} disabled={!isDirty}>
            {isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Layers className="w-4 h-4 text-text-muted" /> Form Fields
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">{activeFields.length} visible</span>
              </h4>
              <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Add Field</Button>
            </div>
            {activeFields.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-border rounded-xl">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3"><Wand2 className="w-6 h-6 text-accent" /></div>
                <p className="text-sm font-semibold text-text-primary">No visible fields</p>
                <p className="text-body-sm text-text-muted mt-1">Add fields from the library or create your own.</p>
                <Button variant="primary" size="sm" className="mt-4" icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Add your first field</Button>
              </div>
            ) : (
              <div className="space-y-2.5">{activeFields.map((f, i) => renderFieldRow(f, i, false))}</div>
            )}
          </div>
          {hiddenFields.length > 0 && (
            <div className="bg-surface-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2"><EyeOff className="w-4 h-4 text-text-muted" /> Hidden Fields
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">{hiddenFields.length} hidden</span>
                </h4>
                <span className="text-[11px] text-text-muted">These fields are saved but not shown to customers.</span>
              </div>
              <div className="space-y-2.5">{hiddenFields.map((f, i) => renderFieldRow(f, i, true))}</div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-surface-card border border-border rounded-xl p-5">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4"><Settings2 className="w-4 h-4 text-text-muted" /> Field Inspector</h4>
            {!selectedField ? (
              <div className="text-center py-8 border border-dashed border-border rounded-xl">
                <div className="mx-auto w-10 h-10 rounded-xl bg-surface-elevated flex items-center justify-center mb-2"><TypeIcon type="text" /></div>
                <p className="text-sm font-semibold text-text-primary">No field selected</p>
                <p className="text-body-sm text-text-muted mt-1">Click a field on the canvas to edit its settings, or add a new one.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 rounded-lg p-2 ${FIELD_TYPE_META[selectedField.type].chip}`}><TypeIcon type={selectedField.type} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary truncate">{selectedField.label}</p>
                    <p className="text-[11px] text-text-muted">Editing settings for this field</p>
                  </div>
                  <button type="button" onClick={() => removeField(selectedField.id)} className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer" title="Remove field"><Trash2 className="w-4 h-4" /></button>
                </div>
                <Input label="Label" value={selectedField.label} onChange={e => updateSelectedField({ label: e.target.value })} />
                <Input label="Help text (optional)" value={selectedField.helpText ?? ''} onChange={e => updateSelectedField({ helpText: e.target.value || undefined })} placeholder="Shown as a hint below the field" />
                <Input label="Placeholder (optional)" value={selectedField.placeholder ?? ''} onChange={e => updateSelectedField({ placeholder: e.target.value || undefined })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Field type"
                    value={selectedField.type}
                    onChange={e => {
                      const nextType = e.target.value as FormFieldType;
                      updateSelectedField({ type: nextType, options: nextType === 'select' ? selectedField.options ?? ['Option A'] : undefined });
                    }}
                    options={FIELD_TYPES.map(t => ({ value: t.value, label: t.label }))}
                  />
                  <label className="flex items-end gap-2 text-xs font-medium text-text-secondary pb-2 cursor-pointer">
                    <Toggle checked={!!selectedField.enabled} onChange={v => updateSelectedField({ enabled: v })} /> Enabled
                  </label>
                </div>
                {selectedField.type === 'select' && (
                  <div>
                    <p className="text-sm font-medium text-text-primary mb-1.5">Dropdown options</p>
                    <OptionChips value={selectedField.options ?? []} onChange={v => updateSelectedField({ options: v })} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer">
                    <Toggle checked={!!selectedField.required} onChange={v => updateSelectedField({ required: v })} /> Required
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer">
                    <Toggle checked={!!selectedField.duplicateKey} onChange={v => updateSelectedField({ duplicateKey: v })} /> Duplicate key
                  </label>
                </div>
                <details className="group border border-border rounded-lg overflow-hidden">
                  <summary className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-text-primary cursor-pointer select-none hover:bg-surface-hover transition-colors list-none">
                    <Info className="w-4 h-4 text-text-muted" /> Validation rules
                    <span className="ml-auto text-text-muted group-open:rotate-180 transition-transform"><ArrowDown className="w-4 h-4" /></span>
                  </summary>
                  <div className="px-3 pb-3 border-t border-border pt-3"><ValidationEditor field={selectedField} onChange={updateSelectedField} /></div>
                </details>
                <details className="group border border-border rounded-lg overflow-hidden">
                  <summary className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-text-primary cursor-pointer select-none hover:bg-surface-hover transition-colors list-none">
                    <Eye className="w-4 h-4 text-text-muted" /> Conditional visibility
                    <span className="ml-auto text-text-muted group-open:rotate-180 transition-transform"><ArrowDown className="w-4 h-4" /></span>
                  </summary>
                  <div className="px-3 pb-3 border-t border-border pt-3"><ShowIfEditor field={selectedField} fields={draft.fields} onChange={updateSelectedField} /></div>
                </details>
              </div>
            )}
          </div>

          <div className="bg-surface-card border border-border rounded-xl p-5">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4"><Eye className="w-4 h-4 text-text-muted" /> Customer Preview</h4>
            <div className="rounded-xl overflow-hidden border border-border shadow-2">
              <div className="bg-gradient-to-r from-primary to-primary-dark px-4 py-2.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-surface-card/70" />
                <span className="w-2 h-2 rounded-full bg-surface-card/40" />
                <span className="w-2 h-2 rounded-full bg-surface-card/40" />
                <span className="ml-2 text-[11px] font-medium text-[#fff]/90">{selectedBu} — Transaction Details</span>
              </div>
              <div className="bg-surface-elevated p-4 space-y-3">
                {activeFields.length === 0 ? (
                  <p className="text-body-sm text-text-muted text-center py-6">No visible fields.</p>
                ) : (
                  activeFields.map(f => (
                    <div key={f.id}>
                      {f.type === 'textarea' ? (
                        <Textarea label={`${f.label}${f.required ? ' *' : ''}`} rows={2} placeholder={f.placeholder} disabled />
                      ) : f.type === 'select' ? (
                        <Select label={`${f.label}${f.required ? ' *' : ''}`} value="" options={(f.options || []).map(o => ({ value: o, label: o }))} disabled />
                      ) : f.type === 'date' ? (
                        <Input label={`${f.label}${f.required ? ' *' : ''}`} type="date" disabled />
                      ) : f.type === 'number' ? (
                        <Input label={`${f.label}${f.required ? ' *' : ''}`} type="number" placeholder={f.placeholder} disabled />
                      ) : f.type === 'currency' ? (
                        <Input label={`${f.label}${f.required ? ' *' : ''}`} placeholder={f.placeholder || '0,000,000.00'} disabled />
                      ) : (
                        <Input label={`${f.label}${f.required ? ' *' : ''}`} placeholder={f.placeholder} disabled />
                      )}
                      {f.helpText && <p className="text-[11px] text-text-muted mt-0.5">{f.helpText}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-[11px] text-text-muted mt-3 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 shrink-0" /> Fields marked <span className="text-error font-semibold">*</span> are compulsory. Duplicate-key fields are used to spot repeat complaints.
            </p>
          </div>
        </div>
      </div>

      <AddFieldModal open={addOpen} onClose={() => setAddOpen(false)} draftFields={draft.fields} onAdd={addField} />
      <ImportConfigModal {...importModalProps} />
    </div>
  );
}
