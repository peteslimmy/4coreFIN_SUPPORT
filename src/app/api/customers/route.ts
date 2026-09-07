import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listCustomers, upsertCustomer } from '../../../../server/repository';
import { buildId } from '../../../../server/lib/ids';
import { audit, AuditAction } from '../../../../server/auditEvents';
import { guardRequest } from '../../../../lib/server/apiContext';

export async function GET(req: NextRequest) {
  const guard = await guardRequest(req, 'customers:manage');
  if (guard instanceof NextResponse) return guard;
  const customers = await listCustomers(guard.session.user);
  return NextResponse.json(customers);
}

const createSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  businessUnit: z.string().optional(),
  createdAt: z.string().optional(),
  totalTickets: z.number().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, 'customers:manage');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const c = { ...parsed.data, email: (parsed.data.email || '').trim().toLowerCase() };

  const entry = { ...c, id: c.id || buildId('cst'), createdAt: c.createdAt || new Date().toISOString(), totalTickets: c.totalTickets || 0 };
  try {
    await upsertCustomer(entry);
  } catch (e: any) {
    if (/duplicate|unique|uq_customers_email_bu/i.test(e.message || '')) {
      return NextResponse.json({ error: 'A customer with this email already exists in this business unit' }, { status: 409 });
    }
    throw e;
  }
  await audit({ event: 'CUSTOMER_CREATED', actor: user.name, role: user.role, action: AuditAction.CUSTOMER_CREATED, details: `Customer ${entry.id} (${entry.email}) created` }).catch(() => {});
  return NextResponse.json(entry, { status: 201 });
}
