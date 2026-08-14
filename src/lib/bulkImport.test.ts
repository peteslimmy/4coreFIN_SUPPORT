import { describe, it, expect } from 'vitest';
import { referenceKind } from '../types/reference';
import { parseCsvText, prepareRows, bulkImportTemplate } from './bulkImport';

const channels = referenceKind('paymentChannels')!;
const categories = referenceKind('categories')!;
const users = referenceKind('users')!;

describe('parseCsvText', () => {
  it('parses rows with 1-based row numbers (header is row 1)', () => {
    const out = parseCsvText('value\nPOS\nUSSD');
    expect(out.errors).toEqual([]);
    expect(out.rows).toEqual([
      { row: 2, record: { value: 'POS' } },
      { row: 3, record: { value: 'USSD' } },
    ]);
  });

  it('trims headers and skips empty lines', () => {
    const out = parseCsvText('  value  \nPOS\n\nUSSD\n');
    expect(out.rows.map((r) => r.record)).toEqual([{ value: 'POS' }, { value: 'USSD' }]);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    const out = parseCsvText('\uFEFFvalue\nPOS');
    expect(out.rows[0]).toEqual({ row: 2, record: { value: 'POS' } });
  });
});

describe('paymentChannels bulk import', () => {
  it('prepares one bare-string payload per non-empty value', () => {
    const parsed = parseCsvText('value\nPOS\nWeb');
    const out = prepareRows(channels, parsed, []);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ row: 2, label: 'POS', payload: 'POS' });
    expect(out.rows[1]).toMatchObject({ row: 3, label: 'Web', payload: 'Web' });
    expect(out.errors).toEqual([]);
  });

  it('skips empty values as invalid rows', () => {
    const parsed = parseCsvText('value\n   \nPOS\n');
    const out = prepareRows(channels, parsed, []);
    expect(out.rows).toHaveLength(1);
    expect(out.errors).toEqual([{ row: 2, message: 'Missing channel name' }]);
  });

  it('flags duplicates already in the system', () => {
    const parsed = parseCsvText('value\nPOS\nPOS');
    const out = prepareRows(channels, parsed, ['POS']);
    expect(out.rows).toHaveLength(0);
    expect(out.duplicates).toHaveLength(2);
    expect(out.duplicates[0].message).toBe('"POS" already exists');
  });

  it('dedupes repeated values within the same file', () => {
    const parsed = parseCsvText('value\nPOS\nPOS');
    const out = prepareRows(channels, parsed, []);
    expect(out.rows).toHaveLength(1);
    expect(out.duplicates).toHaveLength(1);
  });
});

describe('categories bulk import', () => {
  it('maps name/description and parses slaHours to a positive int', () => {
    const parsed = parseCsvText('name,description,slaHours\nPayment Dispute,Refund,24\n');
    const out = prepareRows(categories, parsed, []);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].payload).toEqual({ name: 'Payment Dispute', description: 'Refund', slaHours: 24 });
    expect(out.errors).toEqual([]);
  });

  it('omits slaHours when blank and drops description default', () => {
    const parsed = parseCsvText('name,slaHours\nOnboarding,\n');
    const out = prepareRows(categories, parsed, []);
    expect(out.rows[0].payload).toEqual({ name: 'Onboarding', description: '' });
    expect('slaHours' in (out.rows[0].payload as Record<string, unknown>)).toBe(false);
  });

  it('rejects non-positive or non-integer slaHours', () => {
    const parsed = parseCsvText('name,slaHours\nA,0\nB,2.5\n');
    const out = prepareRows(categories, parsed, []);
    expect(out.rows).toHaveLength(0);
    expect(out.errors).toHaveLength(2);
    expect(out.errors[0].message).toMatch(/whole number of 1 or more/);
  });

  it('requires a name and flags duplicates', () => {
    const parsed = parseCsvText('name,description\n,Pending\nPayment Dispute,x\n');
    const out = prepareRows(categories, parsed, [{ name: 'Payment Dispute' }]);
    expect(out.rows).toHaveLength(0);
    expect(out.errors).toEqual([{ row: 2, message: 'name is required' }]);
    expect(out.duplicates).toEqual([{ row: 3, message: 'Category "Payment Dispute" already exists' }]);
  });
});

describe('users bulk import', () => {
  const header = 'firstName,lastName,email,accountType,role,bu,partner,phone,password\n';

  it('merges first/last into a single name payload', () => {
    const parsed = parseCsvText(header + 'Ada,Lagos,ada@x.com,BU,BU_SUPPORT,POSSAP,Paystack,0801,Temp1234');
    const out = prepareRows(users, parsed, []);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].payload).toEqual({
      name: 'Ada Lagos',
      email: 'ada@x.com',
      role: 'BU_SUPPORT',
      bu: 'POSSAP',
      phone: '0801',
      password: 'Temp1234',
    });
    expect(out.errors).toEqual([]);
  });

  it('requires firstName, lastName, email and bu', () => {
    const parsed = parseCsvText(header + 'Ada,,ada@x.com,BU,BU_SUPPORT,POSSAP,Paystack,,Temp1234');
    const out = prepareRows(users, parsed, []);
    expect(out.rows).toHaveLength(0);
    expect(out.errors).toEqual([
      { row: 2, message: 'lastName is required' },
    ]);
  });

  it('rejects invalid email, unknown role and short password', () => {
    const parsed = parseCsvText(header + 'Ada,Lagos,not-an-email,BU,INVALID_ROLE,POSSAP,Paystack,0801,12345');
    const out = prepareRows(users, parsed, []);
    expect(out.rows).toHaveLength(0);
    expect(out.errors.map((e) => e.message)).toEqual([
      '"not-an-email" is not a valid email',
      'role must be one of: SUPER_ADMIN, BU_SUPPORT, EXECUTIVE, PARTNER, CUSTOMER',
      'password must be at least 6 characters',
    ]);
  });

  it('flags already-registered emails as duplicates case-insensitively', () => {
    const parsed = parseCsvText(header + 'Ada,Lagos,ADA@X.COM,BU,BU_SUPPORT,POSSAP,Paystack,0801,Temp1234');
    const out = prepareRows(users, parsed, [{ email: 'ada@x.com' }]);
    expect(out.rows).toHaveLength(0);
    expect(out.duplicates).toEqual([{ row: 2, message: 'ada@x.com already registered' }]);
  });
});

describe('bulkImportTemplate', () => {
  it('renders header + sample row for paymentChannels', () => {
    expect(bulkImportTemplate(channels)).toBe('value\nPOS');
  });

  it('renders header + sample row for categories', () => {
    expect(bulkImportTemplate(categories)).toBe('name,description,slaHours\nPayment Dispute,Resolution target,24');
  });

  it('renders the full user columns incl. password', () => {
    const csv = bulkImportTemplate(users);
    expect(csv.split('\n')[0]).toBe('firstName,lastName,email,accountType,role,bu,partner,phone,password');
    expect(csv).toContain('Ada,Lagos,ada@example.com,BU,BU_SUPPORT_L1,POSSAP,Paystack,08012345678,Temp1234');
  });
});