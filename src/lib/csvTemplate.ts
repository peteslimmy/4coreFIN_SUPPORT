import type { BuFormConfig } from '../types/forms';

export const CSV_TEMPLATE_HEADERS = [
  'id', 'label', 'type', 'options', 'placeholder',
  'required', 'enabled', 'duplicateKey', 'order',
  'helpText', 'validation_min', 'validation_max',
  'validation_pattern', 'validation_message',
  'showIf_field', 'showIf_equals',
];

export function escapeCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsvRow(values: (string | number | boolean | undefined)[]): string {
  return values.map(escapeCsvValue).join(',');
}

export function generateCsvTemplate(): string {
  const exampleRows: (string | number | boolean)[][] = [
    ['transactionId', 'Transaction ID Reference', 'text', '', 'TXN_123456', 'false', 'true', 'true', '1', '', '', '', '', '', '', ''],
    ['fraudType', 'Fraud Type', 'select', 'Skimming|Phishing|Card Cloning', '', 'true', 'true', 'false', '2', '', '', '', '', '', '', ''],
    ['terminalId', 'Terminal ID', 'text', '', 'TERM_9042', 'false', 'true', 'false', '3', 'POS terminal ID where dispute originated', '', '', '', '', 'category', 'Payment Dispute'],
  ];

  const rows = [buildCsvRow(CSV_TEMPLATE_HEADERS), ...exampleRows.map(buildCsvRow)];
  return rows.join('\n') + '\n';
}

export function downloadCsvTemplate(filename = 'form-config-template.csv'): void {
  const blob = new Blob([generateCsvTemplate()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateConfigCsv(config: BuFormConfig): string {
  const rows = [buildCsvRow(CSV_TEMPLATE_HEADERS)];
  const sorted = [...config.fields].sort((a, b) => a.order - b.order);
  for (const f of sorted) {
    rows.push(buildCsvRow([
      f.id,
      f.label,
      f.type,
      f.options?.join('|') ?? '',
      f.placeholder ?? '',
      String(f.required),
      String(f.enabled),
      String(f.duplicateKey),
      f.order,
      f.helpText ?? '',
      f.validation?.min ?? '',
      f.validation?.max ?? '',
      f.validation?.pattern ?? '',
      f.validation?.message ?? '',
      f.showIf?.field ?? '',
      f.showIf?.equals !== undefined ? String(f.showIf.equals) : '',
    ]));
  }
  return rows.join('\n') + '\n';
}

export function downloadConfigCsv(config: BuFormConfig, filename = `form-config-${config.bu.toLowerCase()}.csv`): void {
  const blob = new Blob([generateConfigCsv(config)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
