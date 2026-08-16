import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createApiRouter, sniffMimeType } from '../server/routes';
import { requireCsrf } from '../server/auth';
import { resetDatabase, insertRows } from './helpers/testDb';
import { createTestUser } from './helpers/testUsers';
import { ticketRow } from './helpers/testSeeds';
import './helpers/conftest';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

// Real magic-byte payloads (tiny but valid signatures).
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
// Classic PE executable header ("MZ"), intentionally NOT any allowed type.
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00');

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
app.use('/api', createApiRouter());

interface Session {
  session: string;
  csrf: string;
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  const cookies = (res.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
  return {
    session: cookies.find((c) => c.startsWith('4c_session=')) || '',
    csrf: cookies.find((c) => c.startsWith('4c_csrf=')) || '',
  };
}

function authedHeaders(s: Session): Record<string, string> {
  const headers: Record<string, string> = { Cookie: `${s.session}; ${s.csrf}` };
  if (s.csrf) headers['X-CSRF-Token'] = s.csrf.split('=')[1];
  return headers;
}

async function seedBaseStore() {
  await createTestUser({
    id: 'usr-a',
    name: 'Alice Alpha',
    email: 'alice@alpha.com',
    password: PASSWORD,
    role: 'BU_SUPPORT',
    bu: 'ALPHA',
    phone: '',
  });
  await insertRows('customers', [
    {
      id: 'cst-a1',
      first_name: 'Faith',
      last_name: 'Adeleke',
      email: 'faith@example.com',
      phone: '',
      business_unit: 'ALPHA',
      tenant_id: ALPHA,
      created_at: '2026-01-01T00:00:00Z',
      total_tickets: 1,
      notes: null,
    },
  ]);
  const tkt = await ticketRow({
    id: 'tkt-a1',
    business_unit: 'ALPHA',
    provider: 'Paystack',
    category: 'Payment Dispute',
    issue_type: 'Payment Dispute',
    priority: 'HIGH',
    status: 'INVESTIGATE',
    is_deleted: false,
    created_at: '2026-07-01T00:00:00Z',
    sla_deadline: '2026-07-10T00:00:00Z',
    customer_name: 'Faith',
    customer_email: 'faith@example.com',
    customer_phone: '',
    customer_last_name: '',
    customer_id: 'cst-a1',
    amount: 100,
    transaction_id: 'TX1',
    card_pan: '****',
    description: '',
    is_escalated: false,
    escalation_count: 0,
    assigned_agent_id: '',
    major_incident_id: null,
    watchers: [],
  });
  await insertRows('tickets', [tkt]);
}

beforeEach(async () => {
  await resetDatabase();
  await seedBaseStore();
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe('sniffMimeType — magic-byte detection', () => {
  it('detects PNG / JPEG / GIF / WEBP / PDF signatures', () => {
    expect(sniffMimeType(PNG)).toBe('image/png');
    expect(sniffMimeType(JPEG)).toBe('image/jpeg');
    expect(sniffMimeType(GIF)).toBe('image/gif');
    expect(sniffMimeType(WEBP)).toBe('image/webp');
    expect(sniffMimeType(PDF)).toBe('application/pdf');
  });

  it('returns null for an executable header', () => {
    expect(sniffMimeType(EXE)).toBeNull();
  });

  it('returns null for short/empty buffers', () => {
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
    expect(sniffMimeType(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe('Evidence upload — content verification', () => {
  it('rejects an EXE masquerading as PNG (declared type mismatches bytes)', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/evidence/upload`, {
      method: 'POST',
      headers: {
        ...authedHeaders(s),
        'Content-Type': 'image/png',
        'x-ticket-id': 'tkt-a1',
        'x-filename': 'receipt.png',
      },
      body: EXE,
    });
    expect(res.status).toBe(415);
  });

  it('rejects an EXE masquerading as PDF', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/evidence/upload`, {
      method: 'POST',
      headers: {
        ...authedHeaders(s),
        'Content-Type': 'application/pdf',
        'x-ticket-id': 'tkt-a1',
        'x-filename': 'statement.pdf',
      },
      body: EXE,
    });
    expect(res.status).toBe(415);
  });

  it('accepts a genuine PNG and records the verified type', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/evidence/upload`, {
      method: 'POST',
      headers: {
        ...authedHeaders(s),
        'Content-Type': 'image/png',
        'x-ticket-id': 'tkt-a1',
        'x-filename': 'receipt.png',
      },
      body: PNG,
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as any;
    expect(row.fileType).toBe('image/png');
  });

  it('accepts a genuine PDF and records the verified type', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/evidence/upload`, {
      method: 'POST',
      headers: {
        ...authedHeaders(s),
        'Content-Type': 'application/pdf',
        'x-ticket-id': 'tkt-a1',
        'x-filename': 'statement.pdf',
      },
      body: PDF,
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as any;
    expect(row.fileType).toBe('application/pdf');
  });

  it('still rejects unlisted declared types before content checks', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/evidence/upload`, {
      method: 'POST',
      headers: {
        ...authedHeaders(s),
        'Content-Type': 'application/octet-stream',
        'x-ticket-id': 'tkt-a1',
        'x-filename': 'blob.bin',
      },
      body: Buffer.from('MZ...'),
    });
    expect(res.status).toBe(415);
  });
});