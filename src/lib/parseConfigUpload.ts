import Papa from 'papaparse';

import type { FormFieldDefinition, FormFieldType, ParseFieldError, ImportResult } from '../types/forms';

const VALID_TYPES: FormFieldType[] = ['text', 'number', 'currency', 'select', 'date', 'textarea'];

function toBool(v: unknown): boolean {
  return String(v ?? '').toLowerCase() === 'true';
}

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && !Number.isNaN(n) ? n : undefined;
}

function toStr(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s || undefined;
}

function splitOptions(v: unknown): string[] | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  return s.split('|').map(o => o.trim()).filter(Boolean);
}

function makeValidation(row: Record<string, unknown>) {
  const min = toNum(row.validation_min);
  const max = toNum(row.validation_max);
  const pattern = toStr(row.validation_pattern);
  const message = toStr(row.validation_message);
  if (min === undefined && max === undefined && pattern === undefined) return undefined;
  return { min, max, pattern, message };
}

function makeShowIf(row: Record<string, unknown>) {
  const field = toStr(row.showIf_field);
  const rawEquals = row.showIf_equals;
  if (!field) return undefined;
  const equals = (rawEquals !== undefined && rawEquals !== '')
    ? (rawEquals as string | number | boolean)
    : ('' as string | number | boolean);
  return { field, equals };
}

function buildField(row: Record<string, unknown>, rowIndex: number): { field: FormFieldDefinition | null; error?: ParseFieldError } {
  const id = toStr(row.id);
  const label = toStr(row.label);
  const typeRaw = toStr(row.type);

  if (!id) return { field: null, error: { row: rowIndex, fieldId: 'id', message: 'Missing required field id' } };
  if (!label) return { field: null, error: { row: rowIndex, fieldId: 'label', message: 'Missing required field label' } };
  if (!typeRaw || !VALID_TYPES.includes(typeRaw as FormFieldType)) {
    return { field: null, error: { row: rowIndex, fieldId: id, message: `Invalid type "${typeRaw}". Must be one of: ${VALID_TYPES.join(', ')}` } };
  }

  const type = typeRaw as FormFieldType;
  const options = type === 'select' ? splitOptions(row.options) : undefined;
  const order = toNum(row.order);
  const validation = makeValidation(row);
  const showIf = makeShowIf(row);

  return {
    field: {
      id,
      label,
      type,
      options,
      placeholder: toStr(row.placeholder),
      required: toBool(row.required),
      enabled: toBool(row.enabled),
      duplicateKey: toBool(row.duplicateKey),
      order: order ?? 0,
      helpText: toStr(row.helpText),
      validation,
      showIf,
    },
  };
}

export function parseCsv(text: string): ImportResult {
  const result: ImportResult = { fields: [], errors: [] };
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    result.errors.push({ row: 0, fieldId: 'file', message: `CSV parse error: ${parsed.errors[0].message}` });
    return result;
  }

  parsed.data.forEach((row, idx) => {
    const { field, error } = buildField(row, idx + 2);
    if (error) result.errors.push(error);
    if (field) result.fields.push(field);
  });

  return result;
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<ImportResult> {
  const result: ImportResult = { fields: [], errors: [] };

  try {
    // xlsx is ~400 KB and only needed for spreadsheet imports — loaded on
    // demand so CSV-only sessions never pay for it.
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      result.errors.push({ row: 0, fieldId: 'file', message: 'No sheets found in workbook' });
      return result;
    }

    const rows: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    if (rows.length === 0) {
      result.errors.push({ row: 0, fieldId: 'file', message: 'File is empty' });
      return result;
    }

    const headers = rows[0].map((h, i) => (typeof h === 'string' ? h.trim() : `col_${i}`));
    const dataRows = rows.slice(1).filter(r => r.some(cell => cell !== '' && cell !== null && cell !== undefined));

    dataRows.forEach((row, idx) => {
      const record: Record<string, unknown> = {};
      headers.forEach((h, i) => { record[h] = row[i] ?? ''; });
      const { field, error } = buildField(record, idx + 2);
      if (error) result.errors.push(error);
      if (field) result.fields.push(field);
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    result.errors.push({ row: 0, fieldId: 'file', message: `XLSX parse failed: ${msg}` });
  }

  return result;
}

export async function parseConfigUpload(file: File): Promise<ImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  // Cap workbook size: xlsx parsing is regex-heavy (SheetJS ReDoS advisories)
  // and runs in the browser on admin-uploaded files. Oversized inputs are
  // rejected outright rather than parsed.
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2MB
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      fields: [],
      errors: [{ row: 0, fieldId: 'file', message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 2MB.` }],
    };
  }

  if (ext === 'csv') {
    const text = await file.text();
    return parseCsv(text);
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    return await parseXlsx(buffer);
  }

  return {
    fields: [],
    errors: [{ row: 0, fieldId: 'file', message: `Unsupported file type ".${ext}". Use .csv or .xlsx.` }],
  };
}
