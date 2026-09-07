import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertCustomer, deleteCustomer, getScopedCustomer, countTicketsByCustomer } from '../../../../../server/repository';
import { audit, AuditAction } from '../../../../../server/auditEvents';
import { guardRequest } from '../../../../../lib/server/apiContext';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'customers:manage');
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;
  const existing = await getScopedCustomer(id, guard.session.user);
  if (!existing) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  return NextResponse.json(existing);
}

const patchSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  businessUnit: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'customers:manage');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;
  const { id } = await ctx.params;

  const existing = await getScopedCustomer(id, user);
  if (!existing) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const patch = {
    ...parsed.data,
    email: parsed.data.email !== undefined ? (parsed.data.email || '').trim().toLowerCase() : undefined,
  };

  try {
    await upsertCustomer({ ...patch, id, tenantId: existing.tenantId });
  } catch (e: any) {
    if (/duplicate|unique|uq_customers_email_bu/i.test(e.message || '')) {
      return NextResponse.json({ error: 'A customer with this email already exists in this business unit' }, { status: 409 });
    }
    throw e;
  }
  await audit({ event: 'CUSTOMER_UPDATED', actor: user.name, role: user.role, action: AuditAction.CUSTOMER_UPDATED, details: `Customer ${id} updated` }).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'customers:manage');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;
  const { id } = await ctx.params;

  const existing = await getScopedCustomer(id, user);
  if (!existing) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const ticketCount = await countTicketsByCustomer({ id, email: existing.email, businessUnit: existing.businessUnit });
  if (ticketCount > 0) {
    return NextResponse.json(
      { error: `Customer is referenced by ${ticketCount} ticket(s)`, referencedBy: { tickets: ticketCount } },
      { status: 409 }
    );
  }
  await deleteCustomer(id);
  await audit({ event: 'CUSTOMER_DELETED', actor: user.name, role: user.role, action: AuditAction.CUSTOMER_DELETED, details: `Customer ${id} deleted` }).catch(() => {});
  return NextResponse.json({ ok: true });
}
