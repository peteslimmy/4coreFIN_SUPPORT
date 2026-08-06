import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { listCustomers, upsertCustomer, deleteCustomer, getScopedCustomer, countTicketsByCustomer, appendAuditLog } from '../repository';

export function createCustomersRouter(): Router {
  const router = Router();

  router.get('/customers', requireAuth, requirePermission('customers:manage'), async (req: AuthedRequest, res: Response) => {
    const customers = await listCustomers(req.user!);
    res.json(customers);
  });

  router.post('/customers', requireAuth, requirePermission('customers:manage'), validateBody(z.object({ id: z.string().optional(), firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), businessUnit: z.string().optional(), createdAt: z.string().optional(), totalTickets: z.number().optional(), notes: z.string().optional() })), async (req: AuthedRequest, res: Response) => {
    const c = { ...req.body, email: (req.body.email || '').trim().toLowerCase() };
    const entry = { ...c, id: c.id || 'cst-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), createdAt: c.createdAt || new Date().toISOString(), totalTickets: c.totalTickets || 0 };
    try {
      await upsertCustomer(entry);
    } catch (e: any) {
      if (/duplicate|unique|uq_customers_email_bu/i.test(e.message || '')) {
        return res.status(409).json({ error: 'A customer with this email already exists in this business unit' });
      }
      throw e;
    }
    res.status(201).json(entry);
  });

  router.patch('/customers/:id', requireAuth, requirePermission('customers:manage'), validateBody(z.object({ firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), businessUnit: z.string().optional(), notes: z.string().optional() })), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedCustomer(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });
    const patch = { ...req.body, email: req.body.email !== undefined ? (req.body.email || '').trim().toLowerCase() : undefined };
    try {
      await upsertCustomer({ ...patch, id: req.params.id, tenantId: existing.tenantId });
    } catch (e: any) {
      if (/duplicate|unique|uq_customers_email_bu/i.test(e.message || '')) {
        return res.status(409).json({ error: 'A customer with this email already exists in this business unit' });
      }
      throw e;
    }
    res.json({ ok: true });
  });

  router.delete('/customers/:id', requireAuth, requirePermission('customers:manage'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedCustomer(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });
    const ticketCount = await countTicketsByCustomer({ id: req.params.id, email: existing.email, businessUnit: existing.businessUnit });
    if (ticketCount > 0) {
      return res.status(409).json({ error: `Customer is referenced by ${ticketCount} ticket(s)`, referencedBy: { tickets: ticketCount } });
    }
    await deleteCustomer(req.params.id);
    await appendAuditLog({ ticketId: null, actor: req.user!.name, role: req.user!.role, action: 'CUSTOMER_DELETED', details: `Customer ${req.params.id} deleted` });
    res.json({ ok: true });
  });

  return router;
}
