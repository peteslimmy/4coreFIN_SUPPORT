# Workflow Reconstruction — 4CoreFinSupport

Roles: SUPER_ADMIN, EXECUTIVE, BU_SUPPORT, BU_SUPPORT_L1/L2/L3, PARTNER, CUSTOMER.

## W1 — Ticket lifecycle (BU_SUPPORT)
1. Dashboard (executive: executive dashboard) → Tickets tab
2. Create ticket (customer picker or quick-create): POST /api/tickets → DB INSERT
3. Assign / change status through state machine: RECEIPT → ASSIGNED → INVESTIGATE → RESOLVED (must fill RCA fields via ticketStateMachine) → CLOSED (must have feedback_score from customer)
4. Add comments (internal/external), mentions, evidence upload, watchers
5. SLA countdown + escalation (manual or SLA-job triggered)
6. Feedback entry → close gate
7. Archive / merge / delete

Verification chain: UI detail → GET /api/tickets/:id → DB row → dependent notifications/audit/webhook/SSE

## W2 — Customer complaint (CUSTOMER)
1. Customer Portal tab
2. Dynamic BU form (POSSAP etc.): duplicate detection → submit
3. Ticket lookup by reference
4. Submit feedback/survey after resolution
5. Result: ticket status transitions, customer_id stamped, feedback_score recorded

## W3 — Partner investigation (PARTNER)
1. Payment Partner Portal
2. Ticket queue scoped to own partner_name/partner_org_id
3. Submit investigation / RCA / resolution
4. BU_SUPPORT acceptance/rejection on resolution

## W4 — Major Incident (SUPER_ADMIN/EXECUTIVE)
1. Declare / edit major incident: name, timeline, notifications, PIR
2. Link tickets
3. PIR editing restricted by role

## W5 — Admin config (SUPER_ADMIN or admin:config)
1. Users CRUD + activation toggle
2. Reference data: BUs, partners, categories (with slaHours), paymentChannels, escalationRules, sla_rules, holidays, ticket_templates, savedReplies, notificationConfigs, custom kinds
3. RBAC: roles + permissions matrix
4. Settings: SMTP, branding, API keys, webhooks
5. Form-config import (SUPER_ADMIN only)

## W6 — Profile + security
1. Change password, verify password, avatar upload
2. Forced password change gate
3. Forgot / reset password flow

## W7 — Executive dashboard (EXECUTIVE)
1. KPIs, charts, partner scorecards, risk/compliance/reports
2. PDF export
3. Governance drill-down
4. Executive metrics API

## W8 — Webhook + integrations
1. Create / edit / delete webhooks (SUPER_ADMIN via admin:config)
2. Dispatch on ticket events, SLA events
3. Test dispatch endpoint

## W9 — AI (authenticated)
1. Classify incident (Gemini classify)
2. RCA draft generation (Gemini rca) — real endpoint exists; UI uses fake canned text today
3. Chat (Gemini chat) — real endpoint exists; no wired UI today
4. Budget enforcement (30 req/15 min per user)

## W10 — Audit + compliance
1. Append audit entry (hash chained)
2. Verify audit chain
3. Read audit log (search, filter, export)

## W11 — Landing page / branding (SUPER_ADMIN)
1. Hero image CRUD with versioning, publish/archive/rollback
2. Upload validation (multer + magic bytes + sharp)
3. Public signed URLs for branding assets

## W12 — SLA monitor (background job)
1. SLA check per business hour/holiday rules
2. Breach and at-risk notifications
3. Escalation outputs