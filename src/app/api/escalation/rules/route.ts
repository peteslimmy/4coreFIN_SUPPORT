import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '../../../../../server/supabaseAdmin';
import { audit, AuditAction } from '../../../../../server/auditEvents';
import { guardRequest } from '../../../../../lib/server/apiContext';

const EscalationRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  condition: z.object({
    hoursFromCreation: z.number().min(0),
    priority: z.string().optional(),
    category: z.string().optional(),
  }),
  actions: z.array(z.object({
    type: z.enum(['notify', 'reassign', 'escalate_priority']),
    target: z.string().optional(),
    message: z.string().optional(),
  })),
  active: z.boolean().optional(),
  priority: z.number().int().optional(),
  version: z.number().int().optional(),
});

/**
 * Escalation rules — now relational (migration 083) with optimistic
 * concurrency (`version`), replacing the config-blob read-merge-write that
 * allowed last-write-wins races. Mutations require `admin:config:write`;
 * previously the Express API gated mutations by role string and left GET
 * reachable by CUSTOMER accounts.
 */
export async function GET(req: NextRequest) {
  const guard = await guardRequest(req, 'admin:config:read');
  if (guard instanceof NextResponse) return guard;
  const { data, error } = await supabaseAdmin
    .from('escalation_rules')
    .select('*')
    .order('priority', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, 'admin:config:write');
  if (guard instanceof NextResponse) return guard;
  const parsed = EscalationRuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const body = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('escalation_rules')
    .insert({
      name: body.name,
      description: body.description,
      condition: body.condition,
      action: { actions: body.actions },
      active: body.active ?? true,
      priority: body.priority ?? 100,
    })
    .select('*')
    .single();
  if (error) {
    if (/duplicate key|unique/i.test(String(error.message))) {
      return NextResponse.json({ error: `Rule "${body.name}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await audit({ event: 'ESCALATION_RULE_CREATED', actor: guard.session.user.name, role: guard.session.user.role, action: AuditAction.ESCALATION_RULE_CREATED, details: `Created escalation rule ${body.name}` }).catch(() => {});
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const guard = await guardRequest(req, 'admin:config:write');
  if (guard instanceof NextResponse) return guard;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  const parsed = EscalationRuleSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const body: any = { ...parsed.data, updated_at: new Date().toISOString() };
  if (body.actions) {
    body.action = { actions: body.actions };
    delete body.actions;
  }
  if (body.version === undefined) {
    return NextResponse.json({ error: 'version is required for optimistic updates' }, { status: 400 });
  }
  const expected = body.version;
  delete body.version;
  body.version = expected + 1;

  const { data, error } = await supabaseAdmin
    .from('escalation_rules')
    .update(body)
    .eq('id', id)
    .eq('version', expected)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: 'Rule not found or modified concurrently. Reload and retry.', code: 'CONCURRENT_MODIFICATION' }, { status: 409 });
  }
  await audit({ event: 'ESCALATION_RULE_UPDATED', actor: guard.session.user.name, role: guard.session.user.role, action: AuditAction.ESCALATION_RULE_UPDATED, details: `Updated escalation rule ${data.name}` }).catch(() => {});
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const guard = await guardRequest(req, 'admin:config:write');
  if (guard instanceof NextResponse) return guard;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('escalation_rules')
    .delete()
    .eq('id', id)
    .select('name')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  await audit({ event: 'ESCALATION_RULE_DELETED', actor: guard.session.user.name, role: guard.session.user.role, action: AuditAction.ESCALATION_RULE_DELETED, details: `Deleted escalation rule ${data.name}` }).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
