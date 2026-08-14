import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { api } from './api';
import { syncReferenceCreate, syncReferenceUpdate } from './sync';
import type { ReferenceKindDef } from '../types/reference';

/**
 * Bulk-import helpers for reference-data kinds (Payment Channels, Categories,
 * Users). Rows are parsed from CSV/XLSX, validated with the same rules the
 * single-create form uses, then written one-by-one through the existing create
 * endpoint so every insert keeps the normal server validation + audit trail.
 */

/** Cap workbook size: xlsx parsing is regex-heavy (SheetJS ReDoS advisories). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2MB

export interface BulkImportError {
  /** 0 = file-level error. Otherwise the spreadsheet row (1-based; header is row 1). */
  row: number;
  message: string;
}

export interface ImportRow {
  row: number;
  record: Record<string, unknown>;
}

export interface PreparedImportRow {
  row: number;
  /** Human label used in result summaries. */
  label: string;
  /** Payload sent to the create endpoint (a bare string for string kinds). */
  payload: unknown;
}

export interface BulkParseResult {
  rows: ImportRow[];
  errors: BulkImportError[];
}

export interface BulkPrepareResult {
  rows: PreparedImportRow[];
  /** Validation failures (not imported). */
  errors: BulkImportError[];
  /** Matches an item already in the system (skipped). */
  duplicates: BulkImportError[];
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function toStr(v: unknown): string {
  return String(v ?? '').trim();
}

/**
 * Map a row to the payload actually sent to the server. Handles kind-specific
 * transforms (e.g. users store a single `name` column although the form edits
 * first/last name separately, and categories may carry an optional SLA).
 */
export function toSubmitPayload(kind: ReferenceKindDef, item: Record<string, unknown>, _editing: boolean): Record<string, unknown> {
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

function firstValue(record: Record<string, unknown>): string {
  for (const v of Object.values(record)) {
    const s = toStr(v);
    if (s) return s;
  }
  return '';
}

function parseSlaHours(v: unknown): { value?: number; error?: string } {
  const s = toStr(v);
  if (!s) return {};
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return { error: 'slaHours must be a whole number of 1 or more' };
  }
  return { value: n };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a single parsed row for the given kind and produce the payload that
 * matches what the single-create form would send. Returns an error when the row
 * is invalid; `duplicate` is set when it collides with an existing/batch item.
 */
function prepareRow(
  kind: ReferenceKindDef,
  importRow: ImportRow,
  existing: Set<string>,
  batch: Set<string>,
): { prepared?: PreparedImportRow; errors: string[]; duplicate?: boolean } {
  const { row, record } = importRow;
  const errors: string[] = [];

  if (kind.kind === 'paymentChannels') {
    const value = firstValue(record);
    if (!value) errors.push('Missing channel name');
    else if (existing.has(value) || batch.has(value)) return { duplicate: true, errors: [`"${value}" already exists`] };
    else {
      batch.add(value);
      return { prepared: { row, label: value, payload: value }, errors: [] };
    }
    return { errors };
  }

  if (kind.kind === 'categories') {
    const name = toStr(record.name ?? record.category);
    const sla = parseSlaHours(record.slaHours ?? record.sla_hours);
    if (!name) errors.push('name is required');
    else if (existing.has(name) || batch.has(name)) return { duplicate: true, errors: [`Category "${name}" already exists`] };
    if (sla.error) errors.push(sla.error);
    if (errors.length) return { errors };
    const payload = toSubmitPayload(
      kind,
      sla.value !== undefined ? { name, description: toStr(record.description), slaHours: sla.value } : { name, description: toStr(record.description) },
      false,
    );
    batch.add(name);
    return { prepared: { row, label: name, payload }, errors: [] };
  }

  if (kind.kind === 'users') {
    const firstName = toStr(record.firstName);
    const lastName = toStr(record.lastName);
    const email = toStr(record.email).toLowerCase();
    const role = toStr(record.role);
    const bu = toStr(record.bu ?? record.businessUnit);
    const phone = toStr(record.phone);
    const password = toStr(record.password);

    if (!firstName) errors.push('firstName is required');
    if (!lastName) errors.push('lastName is required');
    if (!email) errors.push('email is required');
     else if (!EMAIL_RE.test(email)) errors.push(`"${record.email}" is not a valid email`);
     if (!role) errors.push('role is required');
     else {
       const roleField = kind.fields.find((f) => f.key === 'role');
       const roles = roleField?.options ?? [];
       // Handle case where options might be a function (e.g., for dynamic fields)
       const rolesArray = typeof roles === 'function' ? [] : (roles as string[]);
       if (rolesArray.length && !rolesArray.includes(role)) errors.push(`role must be one of: ${rolesArray.join(', ')}`);
     }
    if (!bu) errors.push('bu is required');
    if (!password) errors.push('password is required (min 6 chars)');
    else if (password.length < 6) errors.push('password must be at least 6 characters');

    if (errors.length) return { errors };
    if (existing.has(email) || batch.has(email)) return { duplicate: true, errors: [`${email} already registered`] };
    const payload = toSubmitPayload(kind, { firstName, lastName, email, role, bu, phone, password }, false);
    batch.add(email);
    return { prepared: { row, label: email, payload }, errors: [] };
  }

  return { errors: [`Bulk import is not supported for ${kind.label}`] };
}

/**
 * Keep SLA rules in lockstep with a category's default SLA: when a category is
 * saved with an slaHours value, upsert an sla_rule for that category across all
 * priorities (creating missing rules, updating existing ones to the new value).
 * Called after the category itself has been persisted.
 */
export async function syncCategorySla(category: string, slaHours: number): Promise<void> {
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

export function parseCsvText(text: string): BulkParseResult {
  const result: BulkParseResult = { rows: [], errors: [] };
  const parsed = Papa.parse<Record<string, unknown>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    // Papa emits a warning (not a hard failure) when it falls back to ',' on
    // single-column files; treat that as a successful auto-detect.
    const fatal = parsed.errors.filter((e) => e.code !== 'UndetectableDelimiter');
    if (fatal.length > 0) {
      result.errors.push({ row: 0, message: `CSV parse error: ${fatal[0].message}` });
      return result;
    }
  }

  parsed.data.forEach((record, idx) => result.rows.push({ row: idx + 2, record }));
  return result;
}

export function parseXlsxBuffer(buffer: ArrayBuffer): BulkParseResult {
  const result: BulkParseResult = { rows: [], errors: [] };

  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      result.errors.push({ row: 0, message: 'No sheets found in workbook' });
      return result;
    }

    const rows: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    if (rows.length === 0) {
      result.errors.push({ row: 0, message: 'File is empty' });
      return result;
    }

    const headers = rows[0].map((h, i) => (typeof h === 'string' ? h.trim() : `col_${i}`));
    const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== '' && cell !== null && cell !== undefined));

    dataRows.forEach((row, idx) => {
      const record: Record<string, unknown> = {};
      headers.forEach((h, i) => { record[h] = row[i] ?? ''; });
      result.rows.push({ row: idx + 2, record });
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    result.errors.push({ row: 0, message: `Spreadsheet parse failed: ${msg}` });
  }

  return result;
}

/**
 * Parse an uploaded file into raw rows. `await`-able form that reads the file
 * and dispatches to the CSV/XLSX parsers.
 */
export async function parseUploadFile(file: File): Promise<BulkParseResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      rows: [],
      errors: [{ row: 0, message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 2MB.` }],
    };
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') {
    return parseCsvText(await file.text());
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return parseXlsxBuffer(await file.arrayBuffer());
  }
  return {
    rows: [],
    errors: [{ row: 0, message: `Unsupported file type ".${ext}". Use .csv, .xlsx or .xls.` }],
  };
}

/** Identity used to detect existing rows when preparing a batch. */
function existingKey(kind: ReferenceKindDef, item: unknown): string {
  if (kind.kind === 'paymentChannels') return String(item).trim();
  const isObj = typeof item === 'object' && item !== null;
  const row = isObj ? (item as Record<string, unknown>) : null;
  if (kind.kind === 'users') return toStr(row?.email).toLowerCase();
  if (kind.kind === 'categories') return toStr(row ? (row.name ?? row.id) : item);
  return '';
}

/** Group the parsed rows into importable payloads, applying validation + dedupe. */
export function prepareRows(kind: ReferenceKindDef, parsed: BulkParseResult, existingItems: unknown[]): BulkPrepareResult {
  const result: BulkPrepareResult = { rows: [], errors: [], duplicates: [] };
  const existing = new Set<string>(existingItems.map((i) => existingKey(kind, i)).filter(Boolean));
  const batch = new Set<string>();

  for (const err of parsed.errors) {
    result.errors.push(err);
  }
  for (const row of parsed.rows) {
    const out = prepareRow(kind, row, existing, batch);
    if (!out) continue;
    if (out.prepared) {
      result.rows.push(out.prepared);
      continue;
    }
    if (out.duplicate) {
      result.duplicates.push({ row: row.row, message: out.errors[0] ?? 'Duplicate' });
      continue;
    }
    for (const message of out.errors) {
      result.errors.push({ row: row.row, message });
    }
  }

  return result;
}

/** Write a single prepared row through the existing create endpoint (with category → SLA parity). */
export async function createBulkRow(kind: ReferenceKindDef, row: PreparedImportRow): Promise<void> {
  await syncReferenceCreate(kind.kind, row.payload);
  if (kind.kind === 'categories') {
    const sla = (row.payload as Record<string, unknown>)?.slaHours;
    if (sla && Number(sla) > 0) {
      try {
        await syncCategorySla(String((row.payload as Record<string, unknown>).name ?? ''), Number(sla));
      } catch {
        // Category created but SLA sync failed — same graceful degradation as single create.
      }
    }
  }
}

/** Header + one sample row per kind, ready to download as a CSV template. */
export function bulkImportTemplate(kind: ReferenceKindDef): string {
  let columns: { key: string; sample: string }[] = [];

  if (kind.kind === 'paymentChannels') {
    columns = [{ key: 'value', sample: 'POS' }];
  } else if (kind.kind === 'categories') {
    columns = [
      { key: 'name', sample: 'Payment Dispute' },
      { key: 'description', sample: 'Resolution target' },
      { key: 'slaHours', sample: '24' },
    ];
  } else if (kind.kind === 'users') {
    columns = [
      { key: 'firstName', sample: 'Ada' },
      { key: 'lastName', sample: 'Lagos' },
      { key: 'email', sample: 'ada@example.com' },
      { key: 'accountType', sample: 'BU' },
      { key: 'role', sample: 'BU_SUPPORT_L1' },
      { key: 'bu', sample: 'POSSAP' },
      { key: 'partner', sample: 'Paystack' },
      { key: 'phone', sample: '08012345678' },
      { key: 'password', sample: 'Temp1234' },
    ];
  }

  if (columns.length === 0) return '';
  return Papa.unparse([columns.map((c) => c.key), columns.map((c) => c.sample)], { header: false }).replace(/\r\n/g, '\n');
}