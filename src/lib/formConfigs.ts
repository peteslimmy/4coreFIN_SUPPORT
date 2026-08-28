import type { BuFormConfig, FormFieldDefinition, FormFieldType, FormFieldValue } from '../types/forms';

const DEFAULT_BU_LIST = ['POSSAP', 'RETAIL-B', 'CORPORATE', 'SME', 'DIGITAL'];

/** Sentinel values for users without a bank, or whose bank is not listed. */
export const N_A_BANK = 'N/A';
export const BANK_NOT_LISTED = 'BANK NOT LISTED';

export interface NigerianBank {
  value: string;
  label: string;
  /** Flag badge shown next to the bank name (🏦 commercial/merchant, 💳 digital/fintech). */
  flag: string;
}

/**
 * CBN-licensed banks and major digital payment providers in Nigeria,
 * plus the N/A and BANK NOT LISTED escape options.
 */
export const NIGERIAN_BANKS: NigerianBank[] = [
  { value: N_A_BANK, label: 'N/A — Not Applicable', flag: '' },
  { value: BANK_NOT_LISTED, label: 'BANK NOT LISTED', flag: '' },
  { value: 'Access Bank', label: 'Access Bank', flag: '🏦' },
  { value: 'Citibank Nigeria', label: 'Citibank Nigeria', flag: '🏦' },
  { value: 'Ecobank Nigeria', label: 'Ecobank Nigeria', flag: '🏦' },
  { value: 'Fidelity Bank', label: 'Fidelity Bank', flag: '🏦' },
  { value: 'First Bank of Nigeria', label: 'First Bank of Nigeria', flag: '🏦' },
  { value: 'First City Monument Bank', label: 'First City Monument Bank (FCMB)', flag: '🏦' },
  { value: 'Globus Bank', label: 'Globus Bank', flag: '🏦' },
  { value: 'Guaranty Trust Bank', label: 'Guaranty Trust Bank (GTBank)', flag: '🏦' },
  { value: 'Heritage Bank', label: 'Heritage Bank', flag: '🏦' },
  { value: 'Keystone Bank', label: 'Keystone Bank', flag: '🏦' },
  { value: 'Polaris Bank', label: 'Polaris Bank', flag: '🏦' },
  { value: 'Providus Bank', label: 'Providus Bank', flag: '🏦' },
  { value: 'Stanbic IBTC Bank', label: 'Stanbic IBTC Bank', flag: '🏦' },
  { value: 'Standard Chartered Bank', label: 'Standard Chartered Bank', flag: '🏦' },
  { value: 'Sterling Bank', label: 'Sterling Bank', flag: '🏦' },
  { value: 'SunTrust Bank', label: 'SunTrust Bank', flag: '🏦' },
  { value: 'Titan Trust Bank', label: 'Titan Trust Bank', flag: '🏦' },
  { value: 'Union Bank of Nigeria', label: 'Union Bank of Nigeria', flag: '🏦' },
  { value: 'United Bank for Africa', label: 'United Bank for Africa (UBA)', flag: '🏦' },
  { value: 'Unity Bank', label: 'Unity Bank', flag: '🏦' },
  { value: 'VFD Microfinance Bank', label: 'VFD Microfinance Bank', flag: '🏦' },
  { value: 'Wema Bank', label: 'Wema Bank', flag: '🏦' },
  { value: 'Zenith Bank', label: 'Zenith Bank', flag: '🏦' },
  { value: 'Kuda Bank', label: 'Kuda Microfinance Bank', flag: '💳' },
  { value: 'OPay', label: 'OPay', flag: '💳' },
  { value: 'PalmPay', label: 'PalmPay', flag: '💳' },
  { value: 'Moniepoint', label: 'Moniepoint', flag: '💳' },
  { value: 'Chipper Cash', label: 'Chipper Cash', flag: '💳' },
];

/** Dropdown option list ({value,label}) with flag badges baked into the labels. */
export const NIGERIAN_BANK_OPTIONS = NIGERIAN_BANKS.map(b => ({
  value: b.value,
  label: b.flag ? `${b.flag} ${b.label}` : b.label,
}));

/** Back-compat: plain values only (no badges). */
export const NIGERIAN_BANK_VALUES = NIGERIAN_BANKS.map(b => b.value);

export const FIELD_LIBRARY: { id: string; label: string; type: FormFieldType; options?: string[]; placeholder?: string; duplicateKey?: boolean }[] = [
  { id: 'transactionId', label: 'Transaction ID Reference', type: 'text', placeholder: 'TXN_942295...', duplicateKey: true },
  { id: 'referenceId', label: 'Reference ID', type: 'text', placeholder: 'REF_7721...', duplicateKey: true },
  { id: 'amount', label: 'Transaction Amount', type: 'currency', placeholder: '0,000,000.00' },
  { id: 'terminalId', label: 'Terminal ID', type: 'text', placeholder: 'TERM_9042' },
  { id: 'nipSessionId', label: 'NIP Session ID', type: 'text', placeholder: 'NIP_94220' },
  // bankName intentionally NOT in the transaction library — the bank dropdown
  // lives in the Incident Details phase (see NIGERIAN_BANK_OPTIONS).
  { id: 'merchantId', label: 'Merchant ID', type: 'text', placeholder: 'MCH_1188' },
  { id: 'cardScheme', label: 'Card Scheme', type: 'select', options: ['Visa', 'Mastercard', 'Verve', 'Verve Visa'] },
  { id: 'transactionDate', label: 'Transaction Date', type: 'date' },
  { id: 'channel', label: 'Channel', type: 'select', options: ['POS', 'Web', 'Mobile App', 'USSD', 'API'] },
  { id: 'customerReference', label: 'Customer Reference', type: 'text', placeholder: 'CUST_REF_...' },
  { id: 'reason', label: 'Reason for Complaint', type: 'textarea', placeholder: 'Describe the transaction issue...' },
];

function field(id: string, label: string, type: FormFieldType, extra: Partial<FormFieldDefinition> = {}): FormFieldDefinition {
  const library = FIELD_LIBRARY.find(f => f.id === id);
  return {
    id, label, type,
    options: extra.options ?? library?.options,
    placeholder: extra.placeholder ?? library?.placeholder,
    required: extra.required ?? true,
    enabled: extra.enabled ?? true,
    duplicateKey: extra.duplicateKey ?? library?.duplicateKey ?? false,
    order: extra.order ?? 0,
    helpText: extra.helpText,
    validation: extra.validation,
    showIf: extra.showIf,
  };
}

export function buildDefaultBuFormConfig(bu: string): BuFormConfig {
  return {
    bu,
    fields: [
      field('transactionId', 'Transaction ID Reference', 'text', { order: 0, duplicateKey: true, required: false }),
      field('referenceId', 'Reference ID', 'text', { order: 1, duplicateKey: true, required: false }),
      field('amount', 'Transaction Amount', 'currency', { order: 2, required: false }),
      field('terminalId', 'Terminal ID', 'text', { order: 3, required: false, showIf: { field: 'category', equals: 'Payment Dispute' } }),
      field('nipSessionId', 'NIP Session ID', 'text', { order: 4, required: false }),
      field('transactionDate', 'Transaction Date', 'date', { order: 6, required: false }),
      field('channel', 'Channel', 'select', { order: 7, required: false }),
      field('reason', 'Reason for Complaint', 'textarea', { order: 8, required: true }),
    ],
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'SYSTEM',
  };
}

export function getDefaultBuFormConfigs(): BuFormConfig[] {
  return DEFAULT_BU_LIST.map(bu => buildDefaultBuFormConfig(bu));
}

export function getBuFormConfig(configs: BuFormConfig[] | undefined | null, bu: string): BuFormConfig {
  const found = configs?.find(c => c.bu === bu);
  if (!found) return buildDefaultBuFormConfig(bu);
  // Legacy saved configs may still carry bankName in stage 2; the bank dropdown
  // lives in Incident Details now, so strip it from the transaction phase.
  const fields = found.fields.filter(f => f.id !== 'bankName');
  if (fields.length === found.fields.length) return found;
  return { ...found, fields };
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
    if (fieldDef.validation.pattern.length > 200) return `${fieldDef.label} validation pattern is too complex`;
    if (/\([^)]*[+*][^)]*\)[+*]/.test(fieldDef.validation.pattern)) return `${fieldDef.label} validation pattern is invalid`;
    try {
      const re = new RegExp(fieldDef.validation.pattern);
      if (!re.test(raw)) return fieldDef.validation.message || `${fieldDef.label} format is invalid`;
    } catch {
      return `${fieldDef.label} has an invalid validation pattern`;
    }
  }

  return '';
}

export function isFieldVisible(fieldDef: FormFieldDefinition, values: Record<string, FormFieldValue | undefined>): boolean {
  if (!fieldDef.enabled) return false;
  if (!fieldDef.showIf) return true;
  const current = values[fieldDef.showIf.field];
  return String(current ?? '') === String(fieldDef.showIf.equals);
}

export interface MergeSummary {
  added: number;
  updated: number;
  unchanged: number;
  errors: string[];
  finalFieldCount: number;
}

export function mergeConfigs(existing: BuFormConfig, incoming: FormFieldDefinition[]): { config: BuFormConfig; summary: MergeSummary } {
  const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, errors: [], finalFieldCount: 0 };
  const map = new Map<string, FormFieldDefinition>(existing.fields.map(f => [f.id, f]));

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
      map.set(inc.id, { ...inc, order: typeof inc.order === 'number' && !Number.isNaN(inc.order) ? inc.order : existing.fields.length });
      summary.added++;
    }
  }

  summary.unchanged = existing.fields.length - summary.updated;
  const merged = [...map.values()].sort((a, b) => a.order - b.order);
  for (let i = 0; i < merged.length; i++) {
    merged[i] = { ...merged[i], order: i };
  }

  summary.finalFieldCount = merged.length;
  summary.errors = [];

  return {
    config: {
      bu: existing.bu,
      fields: merged,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: existing.updatedBy,
    },
    summary,
  };
}
