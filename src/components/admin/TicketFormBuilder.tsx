import * as React from 'react';
import { useMemo, useState } from 'react';
import {
  ArrowDown, Eye, EyeOff, Save, X, Check,
  Search, Type, Hash, Banknote, ListFilter, CalendarDays, AlignLeft, Info,
  Wand2, Settings2, CopyPlus, Layers3,
  UserRound, FileText, Paperclip, Plus, GripVertical, Trash2, ClipboardList, RotateCcw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Toggle from '../ui/Toggle';
import Textarea from '../ui/Textarea';
import Modal from '../ui/Modal';
import { getBuFormConfig, buildDefaultBuFormConfig, FIELD_LIBRARY } from '../../lib/formConfigs';
import {
  STAGE1_FIELD_LIBRARY, STAGE3_FIELD_LIBRARY,
  getDefaultStage1Config, getDefaultStage3Config,
} from '../../lib/ticketFormConfigs';
import { syncConfig } from '../../lib/sync';
import type {
  BuFormConfig, FormFieldDefinition, FormFieldType,
  FormFieldValidation, TicketFormConfig,
} from '../../types/forms';

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Short Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency (₦)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'file', label: 'File Upload' },
];

const FIELD_TYPE_META: Record<FormFieldType, { icon: typeof Type; chip: string; accent: string }> = {
  text: { icon: Type, chip: 'bg-primary/10 text-primary', accent: 'text-primary' },
  number: { icon: Hash, chip: 'bg-emerald-500/10 text-emerald-600', accent: 'text-emerald-600' },
  currency: { icon: Banknote, chip: 'bg-amber-500/10 text-amber-600', accent: 'text-amber-600' },
  select: { icon: ListFilter, chip: 'bg-violet-500/10 text-violet-600', accent: 'text-violet-600' },
  date: { icon: CalendarDays, chip: 'bg-rose-500/10 text-rose-600', accent: 'text-rose-600' },
  textarea: { icon: AlignLeft, chip: 'bg-cyan-500/10 text-cyan-600', accent: 'text-cyan-600' },
  file: { icon: Paperclip, chip: 'bg-sky-500/10 text-sky-600', accent: 'text-sky-600' },
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
      {(field.type === 'number' || field.type === 'currency' || field.type === 'date') && (
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

function AddFieldModal({ open, onClose, fields, library, onAdd }: {
  open: boolean;
  onClose: () => void;
  fields: FormFieldDefinition[];
  library: FieldLibrary;
  onAdd: (field: FormFieldDefinition) => void;
}) {
  const [tab, setTab] = useState<'library' | 'custom'>('library');
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FormFieldType>('text');
  const [placeholder, setPlaceholder] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [required, setRequired] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter(f => !q || f.label.toLowerCase().includes(q) || f.type.toLowerCase().includes(q));
  }, [library, query]);

  const existingIds = new Set(fields.map(f => f.id));

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
      order: fields.length,
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
            <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${tab === t ? 'bg-accent text-white shadow-2' : 'text-text-secondary hover:text-text-primary'}`}>
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
                    <button key={lib.id} type="button" disabled={added} onClick={() => onAdd({ id: lib.id, label: lib.label, type: lib.type, options: lib.options, placeholder: lib.placeholder, required: false, enabled: true, duplicateKey: !!lib.duplicateKey, order: fields.length })} className={`group text-left rounded-xl border p-3 transition-all duration-150 ${added ? 'border-border bg-surface-elevated opacity-60 cursor-not-allowed' : 'border-border bg-surface-card hover:border-accent hover:shadow-2 cursor-pointer'}`}>
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

export type FieldLibrary = { id: string; label: string; type: FormFieldType; options?: string[]; placeholder?: string; duplicateKey?: boolean }[];

interface StageWorkspaceProps {
  title: string;
  icon: React.ReactNode;
  intro: string;
  draftFields: FormFieldDefinition[];
  library: FieldLibrary;
  onFieldsChange: (fields: FormFieldDefinition[]) => void;
  renderOptionsHint?: () => React.ReactNode;
  showConditionalHint?: boolean;
}

function StageWorkspace({ title, icon, intro, draftFields, library, onFieldsChange, renderOptionsHint, showConditionalHint }: StageWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const activeFields = draftFields.filter(f => f.enabled);
  const hiddenFields = draftFields.filter(f => !f.enabled);
  const selectedField = draftFields.find(f => f.id === selectedId) ?? null;

  const updateSelectedField = (patch: Partial<FormFieldDefinition>) => {
    if (!selectedId) return;
    onFieldsChange(draftFields.map(f => f.id === selectedId ? { ...f, ...patch } : f));
  };

  const removeField = (id: string) => {
    onFieldsChange(draftFields.filter(f => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateField = (id: string) => {
    const src = draftFields.find(f => f.id === id);
    if (!src) return;
    onFieldsChange([...draftFields, { ...src, id: `${id}_copy_${Date.now().toString(36)}`, label: `${src.label} (copy)`, order: draftFields.length }]);
    setSelectedId(null);
  };

  const toggleEnabled = (id: string) => {
    onFieldsChange(draftFields.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
    if (selectedId === id) setSelectedId(null);
  };

  const handleDrop = (targetId: string) => {
    if (dragIndex === null) { setDragIndex(null); setOverIndex(null); return; }
    const fields = activeFields;
    const fromId = fields[dragIndex]?.id;
    if (!fromId) { setDragIndex(null); setOverIndex(null); return; }
    const toId = targetId;
    if (fromId === toId) { setDragIndex(null); setOverIndex(null); return; }
    const ids = fields.map(f => f.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) { setDragIndex(null); setOverIndex(null); return; }
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onFieldsChange(draftFields.map(f => {
      const idx = next.indexOf(f.id);
      return idx >= 0 ? { ...f, order: idx } : f;
    }));
    setDragIndex(null);
    setOverIndex(null);
  };

  const addField = (field: FormFieldDefinition) => {
    if (draftFields.some(f => f.id === field.id)) return;
    onFieldsChange([...draftFields, field]);
    setSelectedId(field.id);
    setAddOpen(false);
  };

  const visibleFields = draftFields
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter(f => f.enabled);

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
        onDrop={() => handleDrop(f.id)}
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
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-surface-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span className="shrink-0 rounded-lg p-1.5 bg-accent/10 text-accent">{icon}</span>
              {title}
            </h4>
          </div>
          <p className="text-xs text-text-muted mb-4">{intro}</p>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">{activeFields.length} visible</span>
            <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddOpen(true)}>Add Field</Button>
          </div>
          {activeFields.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-border rounded-xl">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3"><Wand2 className="w-6 h-6 text-accent" /></div>
              <p className="text-sm font-semibold text-text-primary">No visible fields</p>
              <p className="text-body-sm text-text-muted mt-1">Add fields from the library or create your own.</p>
              <Button variant="primary" size="sm" className="mt-4" icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Add your first field</Button>
            </div>
          ) : (
            <div className="space-y-2.5">{visibleFields.map((f, i) => renderFieldRow(f, i, false))}</div>
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
              {showConditionalHint && (
                <details className="group border border-border rounded-lg overflow-hidden">
                  <summary className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-text-primary cursor-pointer select-none hover:bg-surface-hover transition-colors list-none">
                    <Eye className="w-4 h-4 text-text-muted" /> Conditional visibility
                    <span className="ml-auto text-text-muted group-open:rotate-180 transition-transform"><ArrowDown className="w-4 h-4" /></span>
                  </summary>
                  <div className="px-3 pb-3 border-t border-border pt-3"><ShowIfEditor field={selectedField} fields={draftFields} onChange={updateSelectedField} /></div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="bg-surface-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4"><Eye className="w-4 h-4 text-text-muted" /> Customer Preview</h4>
          <div className="rounded-xl overflow-hidden border border-border shadow-2">
            <div className="bg-gradient-to-r from-primary to-primary-dark px-4 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white/70" />
              <span className="w-2 h-2 rounded-full bg-white/40" />
              <span className="w-2 h-2 rounded-full bg-white/40" />
              <span className="ml-2 text-[11px] font-medium text-white/90">{title}</span>
            </div>
            <div className="bg-surface-elevated p-4 space-y-3">
              {visibleFields.length === 0 ? (
                <p className="text-body-sm text-text-muted text-center py-6">No visible fields.</p>
              ) : (
                visibleFields.map(f => (
                  <div key={f.id}>
                    {f.type === 'textarea' ? (
                      <Textarea label={`${f.label}${f.required ? ' *' : ''}`} rows={2} placeholder={f.placeholder} disabled />
                    ) : f.type === 'file' ? (
                      <div className="rounded-lg border border-dashed border-border bg-surface p-3 text-center text-xs text-text-muted">{f.label}</div>
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
          <div className="mt-3">{renderOptionsHint?.()}</div>
        </div>
      </div>

      <AddFieldModal open={addOpen} onClose={() => setAddOpen(false)} fields={draftFields} library={library} onAdd={addField} />
    </div>
  );
}

export default function TicketFormBuilder() {
  const { businessUnits, buFormConfigs, ticketFormConfigs, setTicketFormConfigs, showToast, logAuditAction, currentUser } = useApp();
  const [selectedBu, setSelectedBu] = useState<string>(businessUnits[0] || 'POSSAP');
  const [stage, setStage] = useState<'stage1' | 'stage2' | 'stage3'>('stage1');

  const savedTicketConfig = useMemo(() => {
    const found = (ticketFormConfigs || []).find(c => c.stage2?.bu === selectedBu);
    return found;
  }, [ticketFormConfigs, selectedBu]);

  const [stage1Draft, setStage1Draft] = useState<FormFieldDefinition[]>(() => savedTicketConfig?.stage1?.fields ?? getDefaultStage1Config().fields);
  const [stage2Draft, setStage2Draft] = useState<BuFormConfig>(() => getBuFormConfig(buFormConfigs, businessUnits[0] || 'POSSAP'));
  const [stage3Draft, setStage3Draft] = useState<FormFieldDefinition[]>(() => savedTicketConfig?.stage3?.fields ?? getDefaultStage3Config().fields);

  const savedStage2 = useMemo(() => getBuFormConfig(buFormConfigs, selectedBu), [buFormConfigs, selectedBu]);
  const isDirty = useMemo(() => {
    if (stage === 'stage1') return JSON.stringify(stage1Draft) !== JSON.stringify(getDefaultStage1Config().fields);
    if (stage === 'stage2') return JSON.stringify(stage2Draft.fields.map(f => ({ ...f, order: undefined }))) !== JSON.stringify(savedStage2.fields.map(f => ({ ...f, order: undefined })));
    return JSON.stringify(stage3Draft) !== JSON.stringify(getDefaultStage3Config().fields);
  }, [stage, stage1Draft, stage2Draft, stage3Draft, savedStage2]);

  const selectBu = (bu: string) => {
    setSelectedBu(bu);
    const saved = (ticketFormConfigs || []).find(c => c.stage2?.bu === bu);
    setStage1Draft(saved?.stage1?.fields ?? getDefaultStage1Config().fields);
    setStage2Draft(getBuFormConfig(buFormConfigs, bu));
    setStage3Draft(saved?.stage3?.fields ?? getDefaultStage3Config().fields);
  };

  const saveConfig = () => {
    const updated: TicketFormConfig = {
      stage1: { fields: stage1Draft },
      stage2: stage2Draft,
      stage3: { fields: stage3Draft },
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: `${currentUser.firstName} ${currentUser.lastName}`,
    };
    const next = (ticketFormConfigs || []).some(c => c.stage2?.bu === selectedBu)
      ? (ticketFormConfigs || []).map(c => (c.stage2?.bu === selectedBu ? updated : c))
      : [...(ticketFormConfigs || []), updated];
    setTicketFormConfigs(next);
    syncConfig('ticketFormConfigs', next);
    const label = stage === 'stage1' ? 'Customer Details' : stage === 'stage2' ? 'Transaction' : 'Description & Evidence';
    logAuditAction(null, stage === 'stage2' ? 'ADMIN_FORM_CONFIG_UPDATED' : 'ADMIN_TICKET_FORM_UPDATED', `Updated ${label} fields for BU: ${selectedBu}.`);
    showToast(`${label} form saved for ${selectedBu}.`, 'success');
  };

  const resetStage = () => {
    if (stage === 'stage1') setStage1Draft(getDefaultStage1Config().fields);
    else if (stage === 'stage2') setStage2Draft(buildDefaultBuFormConfig(selectedBu));
    else setStage3Draft(getDefaultStage3Config().fields);
    showToast(`Reset ${stage} to default layout.`, 'info');
  };

  const stages = [
    { id: 'stage1', label: 'Customer Details', icon: UserRound, desc: 'Step 1 — basic customer & incident info' },
    { id: 'stage2', label: 'Transaction', icon: ClipboardList, desc: 'Step 2 — BU-specific transaction fields' },
    { id: 'stage3', label: 'Description & Evidence', icon: FileText, desc: 'Step 3 — narrative + file evidence' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Layers3 className="w-4 h-4 text-accent" /> Ticket Form Builder
          </h3>
          <p className="text-body-sm text-text-muted mt-0.5">Configure all 3 stages of the ticket creation workflow — per business unit.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            label="Business Unit"
            value={selectedBu}
            onChange={e => selectBu(e.target.value)}
            options={businessUnits.map(bu => ({ value: bu, label: bu }))}
          />
          <Button variant="outlined" size="sm" icon={<RotateCcw className="w-4 h-4" />} onClick={resetStage}>Reset</Button>
          <Button variant="primary" size="sm" icon={<Save className="w-4 h-4" />} onClick={saveConfig} disabled={!isDirty}>
            {isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-surface-card border border-border p-1 gap-1 flex-wrap">
        {stages.map(s => {
          const Icon = s.icon;
          const active = stage === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStage(s.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${active ? 'bg-accent text-white shadow-2' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {stage === 'stage1' && (
        <StageWorkspace
          title="Step 1 — Customer Details"
          intro="Fields customers see when they start a new complaint. Drag to reorder, click to edit."
          draftFields={stage1Draft}
          library={STAGE1_FIELD_LIBRARY}
          onFieldsChange={setStage1Draft}
          icon={<UserRound className="w-4 h-4" />}
          showConditionalHint
        />
      )}
      {stage === 'stage2' && (
        <StageWorkspace
          title={`Step 2 — Transaction (${selectedBu})`}
          intro="BU-specific transaction fields. These use the existing per-BU transaction configuration."
          draftFields={stage2Draft.fields}
          library={FIELD_LIBRARY}
          onFieldsChange={fields => setStage2Draft(prev => ({ ...prev, fields }))}
          icon={<ClipboardList className="w-4 h-4" />}
          showConditionalHint
        />
      )}
      {stage === 'stage3' && (
        <StageWorkspace
          title="Step 3 — Description & Evidence"
          intro="Final step: narrative description plus supporting evidence. Drag to reorder, click to edit."
          draftFields={stage3Draft}
          library={STAGE3_FIELD_LIBRARY}
          onFieldsChange={setStage3Draft}
          icon={<FileText className="w-4 h-4" />}
          showConditionalHint
        />
      )}
    </div>
  );
}