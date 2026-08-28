import type { FormFieldDefinition, FormFieldType, FormFieldValue, TicketFormConfig, TicketFormStageConfig, BuFormConfig, MergeSummary } from '../types/forms';
import { mergeConfigs } from './formConfigs';

const DEFAULT_BU_LIST = ['POSSAP', 'RETAIL-B', 'CORPORATE', 'SME', 'DIGITAL'];

export const STAGE1_FIELD_LIBRARY: { id: string; label: string; type: FormFieldType; options?: string[]; placeholder?: string; duplicateKey?: boolean }[] = [
  { id: 'customerFirstName', label: 'Customer First Name', type: 'text', placeholder: 'John', duplicateKey: false },
  { id: 'customerLastName', label: 'Customer Last Name', type: 'text', placeholder: 'Doe', duplicateKey: false },
  { id: 'customerEmail', label: 'Customer Email', type: 'text', placeholder: 'customer@example.com', duplicateKey: false },
  { id: 'customerPhone', label: 'Customer Phone', type: 'text', placeholder: '+234...', duplicateKey: false },
  { id: 'customerId', label: 'Customer ID', type: 'text', placeholder: 'CUST_12345', duplicateKey: true },
  { id: 'amount', label: 'Transaction Amount', type: 'currency', placeholder: '0,000,000.00' },
  { id: 'partner', label: 'Payment Partner', type: 'select', options: [] },
  { id: 'category', label: 'Issue Category', type: 'select', options: [] },
  { id: 'bankName', label: 'Bank', type: 'select', options: [] },
  { id: 'priority', label: 'Priority', type: 'select', options: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
  { id: 'channel', label: 'Payment Channel', type: 'select', options: ['POS', 'Web', 'Mobile App', 'USSD', 'API'] },
];

export const STAGE3_FIELD_LIBRARY: { id: string; label: string; type: FormFieldType; options?: string[]; placeholder?: string; duplicateKey?: boolean }[] = [
  { id: 'description', label: 'Description', type: 'textarea', placeholder: 'Describe the issue in detail, including steps to reproduce, impact, and any relevant information...', duplicateKey: false },
  { id: 'evidence', label: 'Evidence Upload', type: 'file', placeholder: 'Upload supporting documents, screenshots, or files' },
  { id: 'customerImpact', label: 'Customer Impact', type: 'textarea', placeholder: 'Describe the impact on the customer...' },
  { id: 'internalNotes', label: 'Internal Notes', type: 'textarea', placeholder: 'Internal notes for investigation team...' },
];

function buildField(
  library: typeof STAGE1_FIELD_LIBRARY,
  id: string,
  label: string,
  type: FormFieldType,
  extra: Partial<FormFieldDefinition> = {}
): FormFieldDefinition {
  const lib = library.find(f => f.id === id);
  return {
    id,
    label,
    type,
    options: extra.options ?? lib?.options,
    placeholder: extra.placeholder ?? lib?.placeholder,
    required: extra.required ?? true,
    enabled: extra.enabled ?? true,
    duplicateKey: extra.duplicateKey ?? lib?.duplicateKey ?? false,
    order: extra.order ?? 0,
    helpText: extra.helpText,
    validation: extra.validation,
    showIf: extra.showIf,
  };
}

function buildDefaultStage1(): TicketFormStageConfig {
  return {
    fields: [
      buildField(STAGE1_FIELD_LIBRARY, 'customerFirstName', 'Customer First Name', 'text', { order: 0, required: false }),
      buildField(STAGE1_FIELD_LIBRARY, 'customerLastName', 'Customer Last Name', 'text', { order: 1, required: false }),
      buildField(STAGE1_FIELD_LIBRARY, 'customerEmail', 'Customer Email', 'text', { order: 2, required: false }),
      buildField(STAGE1_FIELD_LIBRARY, 'customerPhone', 'Customer Phone', 'text', { order: 3, required: false }),
      buildField(STAGE1_FIELD_LIBRARY, 'customerId', 'Customer ID', 'text', { order: 4, required: false, duplicateKey: true }),
      buildField(STAGE1_FIELD_LIBRARY, 'amount', 'Transaction Amount', 'currency', { order: 5, required: false }),
      buildField(STAGE1_FIELD_LIBRARY, 'partner', 'Payment Partner', 'select', { order: 6, required: true }),
      buildField(STAGE1_FIELD_LIBRARY, 'category', 'Issue Category', 'select', { order: 7, required: true }),
      buildField(STAGE1_FIELD_LIBRARY, 'bankName', 'Bank', 'select', { order: 8, required: false }),
      buildField(STAGE1_FIELD_LIBRARY, 'priority', 'Priority', 'select', { order: 9, required: true }),
      buildField(STAGE1_FIELD_LIBRARY, 'channel', 'Payment Channel', 'select', { order: 10, required: false }),
    ],
  };
}

function buildDefaultStage3(): TicketFormStageConfig {
  return {
    fields: [
      buildField(STAGE3_FIELD_LIBRARY, 'description', 'Description', 'textarea', { order: 0, required: true }),
      buildField(STAGE3_FIELD_LIBRARY, 'evidence', 'Evidence Upload', 'file', { order: 1, required: false }),
      buildField(STAGE3_FIELD_LIBRARY, 'customerImpact', 'Customer Impact', 'textarea', { order: 2, required: false }),
      buildField(STAGE3_FIELD_LIBRARY, 'internalNotes', 'Internal Notes', 'textarea', { order: 3, required: false, enabled: false }),
    ],
  };
}

export function getDefaultStage1Config(): TicketFormStageConfig {
  return buildDefaultStage1();
}

export function getDefaultStage3Config(): TicketFormStageConfig {
  return buildDefaultStage3();
}

export function buildDefaultTicketFormConfig(bu: string, stage2Config: BuFormConfig): TicketFormConfig {
  return {
    stage1: buildDefaultStage1(),
    stage2: stage2Config,
    stage3: buildDefaultStage3(),
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'SYSTEM',
  };
}

export function getDefaultTicketFormConfigs(stage2Configs: BuFormConfig[]): TicketFormConfig[] {
  return DEFAULT_BU_LIST.map(bu => {
    const stage2 = stage2Configs.find(c => c.bu === bu) || stage2Configs[0];
    return buildDefaultTicketFormConfig(bu, stage2);
  });
}

export function getTicketFormConfig(configs: TicketFormConfig[] | undefined | null, bu: string): TicketFormConfig {
  const found = configs?.find(c => c.stage2.bu === bu);
  if (found) return found;
  const stage2 = found?.stage2 || { bu, fields: [], version: 1, updatedAt: new Date().toISOString(), updatedBy: 'SYSTEM' };
  return buildDefaultTicketFormConfig(bu, stage2);
}

export function validateFieldValue(fieldDef: FormFieldDefinition, value: FormFieldValue | undefined | null): string {
  if (fieldDef.required) {
    const empty = value === undefined || value === null || value === '' || (typeof value === 'number' && Number.isNaN(value));
    if (empty) return `${fieldDef.label} is required`;
  }
  if (value === undefined || value === null || value === '') return '';
  const raw = typeof value === 'string' ? value.trim() : value;

  if (fieldDef.type === 'number' && typeof raw === 'string' && raw !== '') {
    if (Number.isNaN(Number(raw))) return `${fieldDef.label} must be a valid number`;
    const num = Number(raw);
    if (fieldDef.validation?.min !== undefined && num < fieldDef.validation.min) return `${fieldDef.label} must be at least ${fieldDef.validation.min}`;
    if (fieldDef.validation?.max !== undefined && num > fieldDef.validation.max) return `${fieldDef.label} must be at most ${fieldDef.validation.max}`;
  }

  if (fieldDef.type === 'currency' && typeof raw === 'string' && raw !== '') {
    const cleaned = raw.replace(/[^\d.]/g, '');
    if (cleaned === '' || Number(cleaned) <= 0) return `Enter a valid ${fieldDef.label}`;
  }

  if (fieldDef.type === 'date' && typeof raw === 'string' && raw !== '' && Number.isNaN(Date.parse(raw))) {
    return `${fieldDef.label} must be a valid date`;
  }

  if (fieldDef.validation?.pattern && typeof raw === 'string') {
    const re = new RegExp(fieldDef.validation.pattern);
    if (!re.test(raw)) return fieldDef.validation.message || `${fieldDef.label} format is invalid`;
  }

  return '';
}

export function isFieldVisible(fieldDef: FormFieldDefinition, values: Record<string, FormFieldValue | undefined>): boolean {
  if (!fieldDef.enabled) return false;
  if (!fieldDef.showIf) return true;
  const current = values[fieldDef.showIf.field];
  return String(current ?? '') === String(fieldDef.showIf.equals);
}

function mergeStageConfig(existing: FormFieldDefinition[], incoming: FormFieldDefinition[]): { fields: FormFieldDefinition[]; summary: MergeSummary } {
  const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, errors: [], finalFieldCount: 0 };
  const map = new Map<string, FormFieldDefinition>(existing.map(f => [f.id, f]));

  for (const inc of incoming) {
    if (!inc.id || !inc.label) {
      summary.errors.push('Row skipped: missing id or label');
      continue;
    }
    const current = map.get(inc.id);
    if (current) {
      const order = typeof inc.order === 'number' && !Number.isNaN(inc.order) ? inc.order : current.order;
      map.set(inc.id, { ...current, ...inc, order });
      summary.updated++;
    } else {
      map.set(inc.id, { ...inc, order: typeof inc.order === 'number' && !Number.isNaN(inc.order) ? inc.order : existing.length });
      summary.added++;
    }
  }

  summary.unchanged = existing.length - summary.updated;
  const merged = [...map.values()].sort((a, b) => a.order - b.order);
  for (let i = 0; i < merged.length; i++) {
    merged[i] = { ...merged[i], order: i };
  }

  summary.finalFieldCount = merged.length;
  summary.errors = [];

  return { fields: merged, summary };
}

export function mergeTicketFormConfigs(
  existing: TicketFormConfig,
  incoming: { stage1?: FormFieldDefinition[]; stage2?: BuFormConfig; stage3?: FormFieldDefinition[] }
): { config: TicketFormConfig; summary: { stage1: MergeSummary; stage2: MergeSummary; stage3: MergeSummary } } {
  const stage1Result = incoming.stage1 ? mergeStageConfig(existing.stage1.fields, incoming.stage1) : { fields: existing.stage1.fields, summary: { added: 0, updated: 0, unchanged: existing.stage1.fields.length, errors: [], finalFieldCount: existing.stage1.fields.length } };
  const stage3Result = incoming.stage3 ? mergeStageConfig(existing.stage3.fields, incoming.stage3) : { fields: existing.stage3.fields, summary: { added: 0, updated: 0, unchanged: existing.stage3.fields.length, errors: [], finalFieldCount: existing.stage3.fields.length } };

  let stage2Result: { config: BuFormConfig; summary: MergeSummary } = { config: existing.stage2, summary: { added: 0, updated: 0, unchanged: existing.stage2.fields.length, errors: [], finalFieldCount: existing.stage2.fields.length } };
  if (incoming.stage2) {
    const { config, summary } = mergeConfigs(existing.stage2, incoming.stage2.fields);
    stage2Result = { config, summary };
  }

  return {
    config: {
      stage1: { fields: stage1Result.fields },
      stage2: stage2Result.config,
      stage3: { fields: stage3Result.fields },
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: existing.updatedBy,
    },
    summary: {
      stage1: stage1Result.summary,
      stage2: stage2Result.summary,
      stage3: stage3Result.summary,
    },
  };
}

